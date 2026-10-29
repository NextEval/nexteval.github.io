import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
test('clean checkout hydrates generated modules before ESM loads the new presentation',()=>{
 const source=readFileSync(new URL('./current-presentation.mjs',import.meta.url),'utf8');
 const end=source.indexOf('const root=');assert(end>0);
 const root=mkdtempSync(join(tmpdir(),'nexteval-clean-esm-'));
 try{
  const scripts=join(root,'scripts/results-storage');mkdirSync(scripts,{recursive:true});
  writeFileSync(join(scripts,'prepare-public-results.mjs'),`import{mkdirSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';const out=fileURLToPath(new URL('../../bench/results/',import.meta.url));mkdirSync(out,{recursive:true});for(const name of ['presentation.mjs','usage.mjs','model.mjs'])writeFileSync(out+'/'+name,'export {};');globalThis.cleanHydrated=true;`);
  const entry=join(root,'test/current-presentation.mjs');mkdirSync(dirname(entry),{recursive:true});
  writeFileSync(entry,source.slice(0,end)+"\nif(!globalThis.cleanHydrated)throw Error('hydration did not run');\n");
  const child=spawnSync(process.execPath,[entry],{encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);
 }finally{rmSync(root,{recursive:true,force:true});}
});
