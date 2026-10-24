import '../scripts/results-storage/prepare-public-results.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../bench/results/',import.meta.url);
const {PLAN,plannedParticipants}=await import(new URL('plan.mjs',root));
const {sortedParticipants,matrixVisibility}=await import(new URL('model.mjs',root));
const data=JSON.parse(readFileSync(new URL('data/results.json',root),'utf8'));
const planned=plannedParticipants(),old=new Set(data.matrix.filter(c=>Number.isFinite(c.score)).map(c=>c.participant_id));
test('retired Chinese effort tiers never generate empty planned rows',()=>{
 const cancelled=planned.filter(p=>!['GPT','Claude'].includes(p.family)&&p.effort!==(p.family==='MiMo'?'on':'high'));
 assert.deepEqual(cancelled.map(p=>p.participant_id),[],'cancelled empty planning rows remain');
 assert.equal(PLAN.scope.repetitions,3);
});
test('official medium/high and high Qwen Max model remain planned',()=>{
 for(const family of ['GPT','Claude'])assert.deepEqual([...new Set(planned.filter(p=>p.family===family).map(p=>p.effort))].sort(),['high','medium']);
 assert(planned.some(p=>p.model==='qwen3.8-max'&&p.effort==='high'));
 assert(planned.some(p=>p.family==='MiMo'&&p.effort==='on'));
});
test('all published configurations survive including cancelled historical tiers',()=>{
 assert.equal(data.tasks.reduce((n,t)=>n+t.sources.length,0),115);
 for(const task of data.tasks){
  const rows=sortedParticipants(data,task.task_id,planned),ids=new Set(rows.map(p=>p.participant_id));
  assert([...old].every(id=>ids.has(id)),'existing scientific result disappeared');
  assert.equal(ids.size,rows.length);assert.deepEqual(new Set(rows.map(p=>p.participant_id)),new Set([...old,...planned.map(p=>p.participant_id)]));
  const expanded=matrixVisibility(data,rows,true),compact=matrixVisibility(data,rows,false);
  assert.deepEqual(new Set(expanded.rows.map(p=>p.participant_id)),ids);
  assert.deepEqual(new Set(compact.rows.map(p=>p.participant_id)),old);
 }
 assert([...old].some(id=>id.includes('deepseek')&&id.endsWith('--low')),'historical low fixture missing');
});

test('planning labels have no conditional presentation distinction',()=>{
 assert.equal(planned.filter(p=>p.condition).length,0,'conditional presentation remains');
 const rows=planned.filter(p=>p.model==='deepseek-v4.1-flash');
 assert.equal(rows.length,2);assert.deepEqual(rows.map(p=>p.harness).sort(),['claude-code','codex']);
 assert(rows.every(p=>p.effort==='high'));
});
