import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import presentation_overlay as ui

class ProjectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.source=Path(ui.__file__).resolve().parent.parent/'results-ui'
        shutil.copytree(self.source,self.root/'scripts/results-ui')
        self.patch=patch.object(ui,'__file__',str(self.root/'scripts/results-storage/presentation_overlay.py'))
        self.patch.start()
        self.lock=json.loads((self.source/'presentation.lock.json').read_bytes())
        self.manifest={'files':{ui.PREFIX+n:v for n,v in self.lock['preimages'].items() if v is not None}}
        self.manifest['files']['dist/results/data/results.json']={'sha256':'unchanged','bytes':1}
    def tearDown(self):
        self.patch.stop();self.tmp.cleanup()
    def test_exact_base_and_effective_manifest(self):
        projection=ui.load(self.manifest);after=ui.effective_manifest(self.manifest,projection)
        self.assertEqual(after['files']['dist/results/data/results.json'],{'sha256':'unchanged','bytes':1})
        self.assertEqual(ui.load(after)['input_state'],'projected')
    def test_changed_preimage(self):
        self.manifest['files']['dist/results/app.mjs']={'sha256':'bad','bytes':1}
        with self.assertRaises(ValueError):ui.load(self.manifest)
    def test_source_mutation(self):
        (self.root/'scripts/results-ui/app.mjs').write_text('changed')
        with self.assertRaises(ValueError):ui.load(self.manifest)
    def test_source_symlink(self):
        p=self.root/'scripts/results-ui/app.mjs';p.unlink();p.symlink_to(self.source/'app.mjs')
        with self.assertRaises(ValueError):ui.load(self.manifest)
    def test_target_symlink(self):
        out=self.root/'out';out.mkdir();(out/'app.mjs').symlink_to(self.source/'app.mjs')
        with self.assertRaises(ValueError):ui.apply(out,ui.load(self.manifest))
    def test_cannot_add_numerical_target(self):
        lock=copy.deepcopy(self.lock);lock['targets']['data/results.json']={'sha256':'bad','bytes':1}
        (self.root/'scripts/results-ui/presentation.lock.json').write_text(json.dumps(lock))
        with self.assertRaises(ValueError):ui.load(self.manifest)

if __name__=='__main__':unittest.main()
