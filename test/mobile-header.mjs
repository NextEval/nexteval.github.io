import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Mobile header projection rejects unknown CSS and changes only the fixed target',()=>{
 execFileSync('python3',['-c',`
import sys, tempfile, hashlib
from pathlib import Path
sys.path.insert(0,'scripts/results-storage')
import responsive_css as m
manifest={'files':{m.KEY:dict(m.BASE),'data':{'sha256':'unchanged','bytes':3}}}
out=m.effective_manifest(manifest)
assert out['files'][m.KEY]==m.TARGET and out['files']['data']==manifest['files']['data']
assert manifest['files'][m.KEY]==m.BASE
for bad in (b'',b'body{}',m.SUFFIX):
    try:m.project(bad)
    except ValueError:pass
    else:raise AssertionError('unknown CSS accepted')
try:m.effective_manifest({'files':{m.KEY:{'sha256':'wrong','bytes':m.BASE['bytes']}}})
except ValueError:pass
else:raise AssertionError('unknown manifest accepted')
with tempfile.TemporaryDirectory() as d:
    p=Path(d);(p/'other').write_bytes(b'private');(p/'results.css').symlink_to(p/'other')
    try:m.apply(p)
    except ValueError:pass
    else:raise AssertionError('symlink accepted')
    assert (p/'other').read_bytes()==b'private'
print('6 projection assertions passed')
`],{cwd:root,stdio:'pipe'});
});

