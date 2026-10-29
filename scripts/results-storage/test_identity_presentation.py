import copy,json,tempfile,unittest
from pathlib import Path
from identity_presentation import load_identity_presentation,apply_identity_presentation,digest

ROOT=Path(__file__).resolve().parent
class IdentityProjectionTests(unittest.TestCase):
    def setUp(self):
        self.lock=json.loads((ROOT/'identity-presentation.lock.json').read_bytes())
        self.manifest={'files':copy.deepcopy(self.lock['targets'])}
    def load(self):return load_identity_presentation(self.manifest,ROOT/'model-identities-v1.json')
    def test_exact_projected_input(self):
        self.assertEqual(self.load()['input_state'],'projected')
    def test_original_input(self):
        self.manifest['files'].pop('dist/results/identities.mjs')
        for pin in self.manifest['files'].values():pin['sha256']=self.lock['base_app_sha256']
        self.assertEqual(self.load()['input_state'],'base')
    def test_mixed_state_rejected(self):
        self.manifest['files']['dist/results/app.mjs']['sha256']=self.lock['base_app_sha256']
        with self.assertRaises(ValueError):self.load()
    def test_mutated_target_rejected(self):
        for target in self.lock['targets']:
            self.manifest={'files':copy.deepcopy(self.lock['targets'])}
            self.manifest['files'][target]['sha256']='0'*64
            with self.assertRaises(ValueError):self.load()
    def test_projected_application_is_exact_noop(self):
        projection=self.load()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name,raw in projection['assets'].items():
                p=root/name.removeprefix('dist/results/');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
            before={str(p.relative_to(root)):digest(p.read_bytes()) for p in root.rglob('*') if p.is_file()}
            apply_identity_presentation(root,projection)
            self.assertEqual(before,{str(p.relative_to(root)):digest(p.read_bytes()) for p in root.rglob('*') if p.is_file()})
    def test_projected_file_mutation_rejected(self):
        projection=self.load()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name,raw in projection['assets'].items():
                p=root/name.removeprefix('dist/results/');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
            (root/'app.mjs').write_bytes(b'tampered')
            with self.assertRaises(ValueError):apply_identity_presentation(root,projection)
if __name__=='__main__':unittest.main()
