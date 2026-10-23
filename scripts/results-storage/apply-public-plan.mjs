import {readFileSync,writeFileSync,lstatSync,readdirSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
export const BASE_PLAN_SHA='2052b9fcbc34f2be1be73e668b5949d11c1714085a6737e61c0588f6c327a781';
export const PREVIOUS_PLAN_SHA='eed63c0838c5e90b4935b49c547a316b23e95ae6f9f99a74d358442f386606c6';
export const ACTIVE_PLAN_SHA='8714da1a9aae2cd351b1b05150faf1c5341c80f857d7c4aa0627b0792301cf6c';
const digest=b=>createHash('sha256').update(b).digest('hex');
export function applyPlan(output,storage=dirname(fileURLToPath(import.meta.url))) {
 output=resolve(output);storage=resolve(storage);
 const manifest=JSON.parse(readFileSync(join(storage,'reviewed-backlog22.manifest.json')));
 const source=join(storage,'active-plan.mjs');assert(lstatSync(source).isFile()&&!lstatSync(source).isSymbolicLink());
 const raw=readFileSync(source);assert(raw.length<=32768&&digest(raw)===ACTIVE_PLAN_SHA,'approved active plan source');
 assert([BASE_PLAN_SHA,PREVIOUS_PLAN_SHA,ACTIVE_PLAN_SHA].includes(manifest.files?.['dist/results/plan.mjs']?.sha256),'unknown plan predecessor');
 let unchanged=0,currentPlan;
 for(const [name,pin] of Object.entries(manifest.files)) {
  assert(name.startsWith('dist/results/')&&!name.split('/').some(p=>p==='..'||p==='.'),'public asset path');
  const path=join(output,name.slice('dist/results/'.length));assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'public regular file');
  const data=readFileSync(path),hash=digest(data);
  if(name==='dist/results/plan.mjs'){assert([pin.sha256,ACTIVE_PLAN_SHA].includes(hash),'plan preimage changed');currentPlan=hash;}
  else {assert.equal(data.length,pin.bytes,'scientific asset size');assert.equal(hash,pin.sha256,'scientific asset changed');unchanged++;}
 }
 assert(unchanged>=2&&manifest.files['dist/results/data/results.json']&&manifest.files['dist/results/data/website-usage.json'],'scientific source pins');
 const walk=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(join(dir,item.name),prefix+item.name+'/'):[prefix+item.name]);
 assert.deepEqual(new Set(walk(output)),new Set(Object.keys(manifest.files).map(n=>n.slice('dist/results/'.length))),'unexpected public assets');
 if(currentPlan!==ACTIVE_PLAN_SHA){
  const temporary=mkdtempSync(join(dirname(output),'.active-plan-'));
  try {const path=join(temporary,'plan.mjs');writeFileSync(path,raw,{mode:0o644});renameSync(path,join(output,'plan.mjs'));}
  finally {rmSync(temporary,{recursive:true,force:true});}
 }
 return {passed:true,only_changed:'plan.mjs',plan_sha256:ACTIVE_PLAN_SHA,unchanged_assets:unchanged};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(applyPlan(process.argv[2])));
