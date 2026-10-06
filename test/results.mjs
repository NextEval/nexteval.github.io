import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { checkBundle } from '../bench/results/check.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const manifest = JSON.parse(await readFile(join(root,'bench/results-source.json'),'utf8'));
assert.equal(manifest.source_repository,'NextEval/nexteval-bench-website');
for (const [file,hash] of Object.entries(manifest.files)) {
  assert(!file.startsWith('/') && !file.split('/').includes('..'));
  const bytes = await readFile(join(root,'bench/results',file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,`Unsynchronized component: ${file}`);
}
async function allFiles(dir) {
  const files=[];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    assert(!entry.isSymbolicLink());
    if (entry.isDirectory()) files.push(...(await allFiles(join(dir,entry.name))).map(p=>entry.name+'/'+p));
    else files.push(entry.name);
  }
  return files.sort();
}
assert.deepEqual(await allFiles(join(root,'bench/results')),Object.keys(manifest.files).sort(),'Unexpected mirrored file');
console.log(await checkBundle());
