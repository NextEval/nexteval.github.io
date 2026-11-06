import '../scripts/site/build-site.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../_site/bench/results/',import.meta.url);
const snapshot=JSON.parse(await readFile(new URL('data/results.json',root),'utf8'));
const usage=JSON.parse(await readFile(new URL('data/website-usage.json',root),'utf8'));
const {paretoData,validateUsage}=await import(new URL('usage.mjs',root));validateUsage(usage);
const {consumptionView}=await import(new URL('presentation.mjs',root));
assert.equal(usage.groups.length,180);assert(usage.groups.every(g=>g.runs===276));
const measured={cost:{"nexteval-u5-perturbed-noisy@1": 38, "nexteval-u5-perturbed-random-nan@1": 37, "nexteval-u5-perturbed-rotated@1": 40, "nexteval-u5-perturbed@1": 38},
 tokens:{"nexteval-u5-perturbed-noisy@1": 39, "nexteval-u5-perturbed-random-nan@1": 38, "nexteval-u5-perturbed-rotated@1": 41, "nexteval-u5-perturbed@1": 39}};
const displayed={"nexteval-u5-perturbed-noisy@1": 45, "nexteval-u5-perturbed-random-nan@1": 45, "nexteval-u5-perturbed-rotated@1": 45, "nexteval-u5-perturbed@1": 45};
for(const task of snapshot.tasks)for(const metric of ['cost','tokens']){
 assert.equal(paretoData(snapshot,usage,task,metric).points.length,measured[metric][task.task_id]);
 const view=consumptionView(snapshot,usage,task,metric,'',true);
 // DeepSeek V4 Flash has no list price on the 2026-11-04 snapshot date: tokens only, no dollar point.
 assert.equal(view.points.length,displayed[task.task_id]-(metric==='cost'?1:0));assert.equal(view.eligible,displayed[task.task_id]);
}
const statuses={"complete": 153, "incomplete": 23, "tokens_only": 4};
for(const [status,count] of Object.entries(statuses))assert.equal(usage.groups.filter(g=>g.accounting_status===status).length,count);
for(const group of usage.groups){if(group.usage_known_runs<276)assert.equal(group.total_tokens,null);if(group.cost_known_runs<276)assert.equal(group.total_api_equivalent_cost_usd,null);}
console.log('Displayed exact accounting coverage and separate token/cost eligibility passed');

assert.equal(usage.estimates.rows.length,23);assert.equal(usage.groups.filter(g=>g.accounting_status==='incomplete'&&g.total_tokens===null).length,23);
const participants=new Map(snapshot.participants.map(p=>[p.participant_id,p])),features={'nexteval-u5-perturbed@1':'Perturbed','nexteval-u5-perturbed-noisy@1':'Noisy','nexteval-u5-perturbed-rotated@1':'Rotated','nexteval-u5-perturbed-random-nan@1':'RandomNaN'};
for(const task of snapshot.tasks)for(const score of task.scores){
 const p=participants.get(score.participant_id);if(['scipy','reference'].includes(p.harness))continue;
 const g=usage.groups.find(x=>x.participant_id===p.participant_id&&x.task_id===task.task_id);
 const row=usage.estimates.rows.find(r=>r.model===p.model.split('/').at(-1)&&r.harness===p.harness&&r.effort===p.effort&&r.feature===features[task.task_id]);
 assert(g.cost_known_runs===276||row?.estimated_api_equivalent_cost_mean_usd>0||(g.accounting_status==='tokens_only'&&g.usage_known_runs===276),'cost coverage '+p.participant_id);
}
assert.deepEqual([...new Set(usage.groups.filter(g=>g.accounting_status==='tokens_only').map(g=>g.participant_id))],['claude-code--deepseek-v4-flash--high']);
const NOTES={'deepseek-v4-flash':['This model version has been retired; no current official price.'],'gpt-5.6-sol':['The only price the official page publishes; labelled promotional until 2026-11-30.']};
for(const g of usage.groups){const model=participants.get(g.participant_id).model.split('/').at(-1);
 assert.deepEqual((g.pricing_sources||[]).filter(s=>typeof s!=='string').map(s=>s.title),NOTES[model]||[],'price note '+g.participant_id);}
console.log('Every displayed scored group has exact or estimated cost and tokens (one without a 2026-11-04 price); Pareto P/N/R/X 45/45/45/45');
