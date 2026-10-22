import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,symlinkSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {applyPlan,BASE_PLAN_SHA,ACTIVE_PLAN_SHA} from './apply-public-plan.mjs';
const here=dirname(fileURLToPath(import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'active-plan-')),output=join(root,'results'),storage=join(root,'storage');mkdirSync(output);mkdirSync(join(output,'data'));mkdirSync(storage);
 try {
  const old=readFileSync(join(here,'retired-plan-fixture.mjs')),active=readFileSync(join(here,'active-plan.mjs'));assert.equal(sha(old),BASE_PLAN_SHA);assert.equal(sha(active),ACTIVE_PLAN_SHA);
  writeFileSync(join(output,'plan.mjs'),old);writeFileSync(join(storage,'active-plan.mjs'),active);
  const files={'dist/results/plan.mjs':{bytes:old.length,sha256:sha(old)}};
  for(const name of ['results.json','website-usage.json']){const bytes=Buffer.from('{"retained":true}');writeFileSync(join(output,'data',name),bytes);files['dist/results/data/'+name]={bytes:bytes.length,sha256:sha(bytes)};}
  writeFileSync(join(storage,'reviewed-backlog22.manifest.json'),JSON.stringify({files}));fn(output,storage);
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('only approved plan changes and verified application never rewrites the file',()=>fixture((o,s)=>{const first=applyPlan(o,s);assert.equal(first.unchanged_assets,2);assert.equal(sha(readFileSync(join(o,'plan.mjs'))),ACTIVE_PLAN_SHA);const before=lstatSync(join(o,'plan.mjs'),{bigint:true});assert.deepEqual(applyPlan(o,s),first);const after=lstatSync(join(o,'plan.mjs'),{bigint:true});assert.equal(after.ino,before.ino);assert.equal(after.mtimeNs,before.mtimeNs);}));
test('changed scientific result is rejected without repairing or rewriting it',()=>fixture((o,s)=>{writeFileSync(join(o,'data/results.json'),'changed');assert.throws(()=>applyPlan(o,s));assert.equal(readFileSync(join(o,'data/results.json'),'utf8'),'changed');assert.equal(sha(readFileSync(join(o,'plan.mjs'))),BASE_PLAN_SHA);}));
test('unapproved plan predecessor is rejected',()=>fixture((o,s)=>{writeFileSync(join(o,'plan.mjs'),'unknown');assert.throws(()=>applyPlan(o,s),/plan preimage/);}));
test('altered replacement source is rejected',()=>fixture((o,s)=>{writeFileSync(join(s,'active-plan.mjs'),'unknown');assert.throws(()=>applyPlan(o,s),/approved active plan/);}));
test('source symlinks are rejected',()=>fixture((o,s)=>{rmSync(join(s,'active-plan.mjs'));symlinkSync(join(here,'active-plan.mjs'),join(s,'active-plan.mjs'));assert.throws(()=>applyPlan(o,s));}));
test('target symlinks are rejected',()=>fixture((o,s)=>{rmSync(join(o,'plan.mjs'));symlinkSync(join(here,'retired-plan-fixture.mjs'),join(o,'plan.mjs'));assert.throws(()=>applyPlan(o,s));}));
test('parent traversal in a public manifest is rejected',()=>fixture((o,s)=>{const p=join(s,'reviewed-backlog22.manifest.json'),v=JSON.parse(readFileSync(p));v.files['dist/results/../outside']={bytes:0,sha256:'a'.repeat(64)};writeFileSync(p,JSON.stringify(v));assert.throws(()=>applyPlan(o,s),/public asset path/);}));
