import '../scripts/results-storage/prepare-public-results.mjs';
const resultPath='bench/results';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const storage=resolve('scripts/results-storage');
const registry=JSON.parse(readFileSync(storage+'/model-identities-v1.json'));
const moduleSource='const MODEL_IDENTITIES='+JSON.stringify(registry)+';\n'+readFileSync(storage+'/identity-labels-template.mjs','utf8');
const labels=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
const source=readFileSync(resolve(resultPath,'app.mjs'),'utf8');
const segment=source.slice(source.indexOf('const labelFor ='),source.indexOf('const detailFor ='));
const actual=new Function('modelName','harnessName','configurationName',segment+'\nreturn {labelFor,harnessFor};')(labels.modelName,labels.harnessName,labels.configurationName);
test('all model names resolve through the shared exact registry',()=>{
 for(const row of registry.models)for(const model of row.aliases)assert.equal(actual.labelFor({model,harness:'codex',display_name:'wrong',label:'wrong'}),row.display_name,'model presentation differs from registry');
});
test('harness is exactly the framework, not API or machine provenance',()=>{
 assert.equal(actual.harnessFor({harness:'codex',participant_id:'codex--qwen3.8-flash--low--collaborator-macos'}),'Codex');
 assert.equal(actual.harnessFor({harness:'claude-code'}),'Claude Code');
});
test('all primary and archived participants resolve without changing raw IDs',()=>{
 for(const path of ['data/results.json','archive/ten-repeat/data/results.json']){
  const data=JSON.parse(readFileSync(resolve(resultPath,path)));const before=JSON.stringify(data);
  for(const row of data.participants){labels.modelName(row);labels.harnessName(row);}
  assert.equal(JSON.stringify(data),before);
 }
});
test('missing future aliases reject instead of leaking route prefixes',()=>{
 assert.throws(()=>labels.modelName({model:'openai/gpt-6.2-sol'}),/Unregistered/);
 assert.notEqual(labels.modelIdentity({model:'gpt-5.6-sol'}).id,labels.modelIdentity({model:'gpt-6.1-sol'}).id);
});
