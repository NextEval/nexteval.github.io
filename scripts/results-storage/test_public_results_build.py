import hashlib
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from public_results_build import build, extract_tree


class PublicBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.files = {'dist/results/data/results.json': b'{"cost":null}', 'dist/results/model.mjs': b'export const x=1;'}
        self.archive = self.root / 'git.tar.gz'
        self.manifest = {'schema': 'nexteval.web-artifact/1',
            'source': {'repository': 'NextEval/nexteval-bench-website', 'commit': 'a' * 40},
            'files': {k: {'bytes': len(v), 'sha256': hashlib.sha256(v).hexdigest()} for k, v in self.files.items()},
            'artifact': {'sha256': 'b' * 64, 'bytes': 100, 'unpacked_bytes': sum(map(len, self.files.values())), 'file_count': 2},
            'storage': {'provider': 'huggingface', 'repo_id': 'NextEval/nexteval-bench-data', 'private': True,
                'revision': 'c' * 40, 'path': 'web/' + 'b' * 64 + '.tar.gz'}}
        self.manifest['public_distribution'] = {'provider': 'github-release-public-view',
            'repository': 'NextEval/nexteval.github.io', 'tag': 'test', 'name': 'test.tar.gz',
            'url': 'https://github.com/NextEval/nexteval.github.io/releases/download/test/test.tar.gz',
            'release_id': 1, 'asset_id': 2, 'sensitivity': 'approved-public-web-view', 'hf_private_unchanged': True}
        self.pack()

    def tearDown(self): self.temp.cleanup()

    def pack(self, extra=None):
        with tarfile.open(self.archive, 'w:gz') as tf:
            for name, data in self.files.items():
                info = tarfile.TarInfo(name)
                info.size = len(data); tf.addfile(info, io.BytesIO(data))
            if extra: tf.addfile(extra)
        pin = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.manifest['artifact'].update(sha256=pin, bytes=self.archive.stat().st_size)
        self.manifest['storage']['path'] = 'web/' + pin + '.tar.gz'
        self.manifest['public_distribution'].update(sha256=pin, bytes=self.archive.stat().st_size)

    def test_exact_public_bytes(self):
        out = self.root / 'tree'; self.assertEqual(extract_tree(self.manifest, self.archive, out)['files'], 2)
        self.assertEqual((out / 'data/results.json').read_bytes(), b'{"cost":null}')

    def test_corrupt_build_keeps_old_output(self):
        out = self.root / 'bench/results'; out.mkdir(parents=True)
        (out / 'old').write_text('original')
        self.manifest['files']['dist/results/data/results.json']['sha256'] = 'd' * 64
        with self.assertRaises(ValueError): build(self.manifest, out, self.archive)
        self.assertEqual((out / 'old').read_text(), 'original')

    def test_fully_verified_build_is_idempotent_without_download(self):
        out = self.root / 'dist/results'
        self.assertEqual(build(self.manifest, out, self.archive)['files'], 2)
        self.assertTrue(build(self.manifest, out)['already_verified'])

    def test_link_and_traversal_rejected(self):
        info = tarfile.TarInfo('dist/results/link.json')
        info.type = tarfile.SYMTYPE; info.linkname = '/etc/passwd'
        self.pack(info)
        with self.assertRaises(ValueError): extract_tree(self.manifest, self.archive, self.root / 'bad')

    def test_missing_file_rejected(self):
        del self.files['dist/results/model.mjs']; self.pack()
        with self.assertRaises(ValueError): extract_tree(self.manifest, self.archive, self.root / 'bad')

    def test_wrong_root_and_arbitrary_output_rejected(self):
        self.manifest['source']['commit'] = 'main'
        with self.assertRaises(ValueError): extract_tree(self.manifest, self.archive, self.root / 'bad')
        with self.assertRaises(ValueError): build(self.manifest, self.root / 'unrelated', self.archive)

    def test_output_symlink_is_not_followed(self):
        out = self.root / 'dist/results'; out.parent.mkdir()
        target = self.root / 'bench/results'; target.mkdir(parents=True)
        out.symlink_to(target, target_is_directory=True)
        with self.assertRaises(ValueError): build(self.manifest, out, self.archive)

    def test_arbitrary_host_or_private_payload_cannot_be_a_public_distribution(self):
        self.manifest['public_distribution']['url'] = 'https://example.com/stolen.tar.gz'
        with self.assertRaises(ValueError): build(self.manifest, self.root / 'dist/results', self.archive)
        self.manifest['public_distribution']['url'] = 'https://github.com/NextEval/nexteval.github.io/releases/download/test/test.tar.gz'
        self.manifest['public_distribution']['sensitivity'] = 'scientific-archive'
        with self.assertRaises(ValueError): build(self.manifest, self.root / 'dist/results', self.archive)


if __name__ == '__main__': unittest.main()
