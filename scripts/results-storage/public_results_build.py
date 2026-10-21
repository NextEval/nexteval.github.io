"""Materialize an approved public view from a fixed public deployment artifact.

This distribution source is explicit, not a fallback from private HF. It requires
no HF token in public CI. Scientific archives stay private; every public file
must match the same per-file manifest independently verified against private HF.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile
import urllib.request

from web_artifact import materialize, validate_manifest, storage_pin
from public_usage_overlay import load_overlay, apply_overlay


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def matches(manifest, output):
    output = Path(output)
    if not output.is_dir() or output.is_symlink(): return False
    expected = {n.removeprefix('dist/results/'): v for n, v in manifest['files'].items()}
    actual = list(output.rglob('*'))
    if any(p.is_symlink() for p in actual): return False
    files = {str(p.relative_to(output)): p for p in actual if p.is_file()}
    return set(files) == set(expected) and all(files[n].stat().st_size == v['bytes'] and sha(files[n]) == v['sha256'] for n, v in expected.items())


def public_pin(manifest):
    pin = manifest['public_distribution']
    if pin['provider'] != 'github-release-public-view' or pin['repository'] != 'NextEval/nexteval.github.io':
        raise ValueError('public_distribution_repository')
    if pin['sensitivity'] != 'approved-public-web-view' or pin['hf_private_unchanged'] is not True:
        raise ValueError('only_approved_public_view')
    if pin['sha256'] != manifest['artifact']['sha256'] or pin['bytes'] != manifest['artifact']['bytes']:
        raise ValueError('public_distribution_bytes')
    expected = 'https://github.com/NextEval/nexteval.github.io/releases/download/' + pin['tag'] + '/' + pin['name']
    if pin['url'] != expected or not all(c.isalnum() or c in '-_.' for c in pin['tag'] + pin['name']):
        raise ValueError('public_distribution_url')
    if type(pin['asset_id']) is not int or type(pin['release_id']) is not int:
        raise ValueError('public_distribution_identity')
    return pin


def extract_tree(manifest, archive, output):
    validate_manifest(manifest); storage_pin(manifest); public_pin(manifest)
    output = Path(output)
    if output.exists(): raise FileExistsError('new_output_required')
    with tempfile.TemporaryDirectory(prefix='public-view-unpack-', dir=output.parent) as tmp:
        root = Path(tmp) / 'verified'
        result = materialize(manifest, archive, root)
        tree = root / 'dist/results'
        for p in tree.rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
        tree.chmod(0o755)
        tree.rename(output)
    return {'files': result['files'], 'source_commit': result['source_commit'], 'all_file_hashes_verified': True}


def build(manifest, output, archive=None, overlay=None):
    validate_manifest(manifest); storage_pin(manifest); pin = public_pin(manifest)
    output = Path(output)
    if output.is_symlink(): raise ValueError('output_symlink')
    output = output.resolve()
    if output.name != 'results' or output.parent.name not in ('dist', 'bench'):
        raise ValueError('only_generated_results_directory')
    if output.is_symlink(): raise ValueError('output_symlink')
    with tempfile.TemporaryDirectory(prefix='nexteval-public-build-') as lockdir:
        # CI uses independent checkouts; a stable local lock coordinates repeat
        # invocations for the same generated directory within one checkout.
        lockpath = Path(tempfile.gettempdir()) / ('nexteval-public-' + hashlib.sha256(str(output).encode()).hexdigest() + '.lock')
        descriptor = os.open(lockpath, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'a') as lock:
            if os.fstat(lock.fileno()).st_uid != os.getuid(): raise ValueError('foreign_build_lock')
            fcntl.flock(lock, fcntl.LOCK_EX)
            effective = overlay["manifest"] if overlay is not None else manifest
            if matches(effective, output):
                return {'files': len(manifest['files']), 'already_verified': True, 'downloaded': False}
            output.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='.verified-public-', dir=output.parent) as temporary:
                temp = Path(temporary)
                if archive is None:
                    archive = temp / 'reviewed-source.tar.gz'
                    url = pin['url']
                    with urllib.request.urlopen(url, timeout=60) as response, archive.open('xb') as dst:
                        total = 0
                        while block := response.read(1024 * 1024):
                            total += len(block)
                            if total > 512 * 1024**2: raise ValueError('download_size')
                            dst.write(block)
                verified = temp / 'results'
                result = extract_tree(manifest, archive, verified)
                if overlay is not None:
                    apply_overlay(overlay, verified)
                    if not matches(effective, verified): raise ValueError("aggregate_overlay_final_hashes")
                    result["public_aggregate_overlay_verified"] = True
                previous = temp / 'previous-generated-results'
                if output.exists(): output.rename(previous)
                try: verified.rename(output)
                except Exception:
                    if previous.exists(): previous.rename(output)
                    raise
                return {**result, 'already_verified': False, 'downloaded': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--source', choices=['approved-public-release'], required=True)
    parser.add_argument('--archive', help='Explicit offline fixture/origin archive only')
    parser.add_argument('--overrides', help='Hash-bound public aggregate overlay only')
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_bytes())
    overlay = load_overlay(manifest, args.overrides, sha(args.manifest)) if args.overrides else None
    print(json.dumps(build(manifest, args.output, args.archive, overlay)))


if __name__ == '__main__': main()
