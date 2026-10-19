"""Verified, atomic materialization of an immutable static-results artifact.

No model execution, scoring, source checkout mutation, publication, or retry.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import tempfile


def require(condition, code):
    if not condition: raise ValueError(code)


def digest(path):
    with Path(path).open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()


def safe_path(name):
    p = PurePosixPath(name)
    require(isinstance(name, str) and not p.is_absolute() and str(p) == name,
            'normalized_relative_path_required')
    require('\\' not in name and '%' not in name and all(v not in ('.', '..') for v in p.parts), 'unsafe_path')
    require(name.startswith('dist/results/') and p.suffix in ('.json', '.mjs', '.css', '.html'), 'unexpected_web_asset')
    return p


def validate_manifest(m):
    require(m.get('schema') == 'nexteval.web-artifact/1', 'schema')
    require(m['source']['repository'] == 'NextEval/nexteval-bench-website', 'source_repository')
    require(re.fullmatch('[0-9a-f]{40}', m['source']['commit']) is not None, 'immutable_source')
    a = m['artifact']; files = m['files']
    require(0 < len(files) <= 100000 and len(files) == a['file_count'], 'file_count')
    require(type(a['bytes']) is int and 0 < a['bytes'] <= 8 * 1024**3, 'archive_size')
    require(type(a['unpacked_bytes']) is int and 0 <= a['unpacked_bytes'] <= 8 * 1024**3, 'unpacked_size')
    require(re.fullmatch('[0-9a-f]{64}', a['sha256']) is not None, 'archive_hash')
    for name, item in files.items():
        safe_path(name)
        require(type(item['bytes']) is int and item['bytes'] >= 0, 'member_size')
        require(re.fullmatch('[0-9a-f]{64}', item['sha256']) is not None, 'member_hash')
    require(sum(x['bytes'] for x in files.values()) == a['unpacked_bytes'], 'total_size')


def storage_pin(m):
    validate_manifest(m)
    s = m.get('storage')
    require(isinstance(s, dict), 'upload_not_verified_no_hf_pin')
    require(s.get('provider') == 'huggingface' and s.get('private') is True, 'private_hf_required')
    require(s['repo_id'] == 'NextEval/nexteval-bench-data', 'repository_binding')
    require(re.fullmatch('[0-9a-f]{40}', s['revision']) is not None, 'immutable_hf_revision')
    p = PurePosixPath(s['path'])
    require(not p.is_absolute() and str(p) == s['path'] and '..' not in p.parts and '\\' not in s['path'] and '%' not in s['path'], 'storage_path')
    require(m['artifact']['sha256'] in p.name, 'content_addressed_storage_path')
    return {'repo_id': s['repo_id'], 'repo_type': 'dataset', 'revision': s['revision'], 'filename': s['path']}


def materialize(m, archive, output):
    validate_manifest(m)
    archive = Path(archive); output = Path(output)
    if output.exists() or output.is_symlink(): raise FileExistsError('existing_output_do_not_overwrite')
    require(archive.is_file() and not archive.is_symlink(), 'regular_archive')
    require(archive.stat().st_size == m['artifact']['bytes'] and digest(archive) == m['artifact']['sha256'], 'archive_hash_size')
    seen = set()
    with tempfile.TemporaryDirectory(prefix='.verified-results-', dir=output.parent) as temp:
        root = Path(temp) / 'tree'; root.mkdir(mode=0o700)
        with tarfile.open(archive, 'r:gz') as tf:
            for info in tf:
                if info.isdir():
                    p = PurePosixPath(info.name)
                    require(not p.is_absolute() and '..' not in p.parts and '\\' not in info.name, 'unsafe_directory')
                    continue
                safe_path(info.name)
                require(info.isfile() and not info.issparse(), 'regular_members_only')
                require(info.name not in seen and info.name in m['files'], 'extra_or_duplicate_member')
                expected = m['files'][info.name]
                require(info.size == expected['bytes'], 'member_size')
                dest = root / info.name; dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                h = hashlib.sha256(); size = 0
                with tf.extractfile(info) as src, dest.open('xb') as dst:
                    while block := src.read(1024 * 1024):
                        size += len(block); require(size <= expected['bytes'], 'member_overflow')
                        h.update(block); dst.write(block)
                require(size == expected['bytes'] and h.hexdigest() == expected['sha256'], 'member_hash')
                seen.add(info.name)
        require(seen == set(m['files']), 'missing_members')
        root.rename(output)
    return {'passed': True, 'files': len(seen), 'bytes': m['artifact']['unpacked_bytes'],
            'archive_sha256': m['artifact']['sha256'], 'source_commit': m['source']['commit'],
            'deployed': False, 'model_calls': 0}


def from_private_hf(m, output):
    pin = storage_pin(m)
    from huggingface_hub import HfApi, hf_hub_download
    api = HfApi(endpoint='https://huggingface.co')
    info = api.repo_info(repo_id=pin['repo_id'], repo_type='dataset', token=True)
    require(info.private is True and info.id == pin['repo_id'], 'remote_private_binding')
    with tempfile.TemporaryDirectory(prefix='hf-web-build-', dir=Path(output).parent) as cache:
        path = hf_hub_download(**pin, token=True, cache_dir=cache, force_download=True,
                               endpoint='https://huggingface.co')
        resolved = Path(path).resolve()
        require(resolved.is_relative_to(Path(cache).resolve()), 'cache_path')
        return materialize(m, resolved, output)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True)
    p.add_argument('--archive', help='Explicit local origin-only verification; never an automatic HF fallback')
    p.add_argument('--output', required=True, help='New private output directory; must not exist')
    args = p.parse_args(); os.umask(0o077)
    m = json.loads(Path(args.manifest).read_bytes())
    result = materialize(m, args.archive, args.output) if args.archive else from_private_hf(m, args.output)
    print(json.dumps(result))


if __name__ == '__main__': main()
