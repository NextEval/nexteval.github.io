import '../scripts/site/build-site.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../_site/bench/results/',import.meta.url);
const snapshot=JSON.parse(await readFile(new URL('data/results.json',root),'utf8'));
const usage=JSON.parse(await readFile(new URL('data/website-usage.json',root),'utf8'));
const {paretoData,validateUsage}=await import(new URL('usage.mjs',root));validateUsage(usage);
const {consumptionView}=await import(new URL('presentation.mjs',root));
assert.equal(usage.groups.length,170);assert(usage.groups.every(g=>g.runs===276));
const measured={"nexteval-u5-perturbed-noisy@1": 38, "nexteval-u5-perturbed-random-nan@1": 35, "nexteval-u5-perturbed-rotated@1": 38, "nexteval-u5-perturbed@1": 37};
const displayed={"nexteval-u5-perturbed-noisy@1": 43, "nexteval-u5-perturbed-random-nan@1": 42, "nexteval-u5-perturbed-rotated@1": 42, "nexteval-u5-perturbed@1": 43};
for(const task of snapshot.tasks)for(const metric of ['cost','tokens']){
 assert.equal(paretoData(snapshot,usage,task,metric).points.length,measured[task.task_id]);
 const view=consumptionView(snapshot,usage,task,metric,'',true);
 assert.equal(view.points.length,displayed[task.task_id]);assert.equal(view.eligible,displayed[task.task_id]);
}
const statuses={"complete": 148, "incomplete": 22};
for(const [status,count] of Object.entries(statuses))assert.equal(usage.groups.filter(g=>g.accounting_status===status).length,count);
for(const group of usage.groups){if(group.usage_known_runs<276)assert.equal(group.total_tokens,null);if(group.cost_known_runs<276)assert.equal(group.total_api_equivalent_cost_usd,null);}
console.log('Displayed exact accounting coverage and separate token/cost eligibility passed');

assert.equal(usage.estimates.rows.length,22);assert.equal(usage.groups.filter(g=>g.accounting_status==='incomplete'&&g.total_tokens===null).length,22);
const participants=new Map(snapshot.participants.map(p=>[p.participant_id,p])),features={'nexteval-u5-perturbed@1':'Perturbed','nexteval-u5-perturbed-noisy@1':'Noisy','nexteval-u5-perturbed-rotated@1':'Rotated','nexteval-u5-perturbed-random-nan@1':'RandomNaN'};
for(const task of snapshot.tasks)for(const score of task.scores){
 const p=participants.get(score.participant_id);if(['scipy','reference'].includes(p.harness))continue;
 const g=usage.groups.find(x=>x.participant_id===p.participant_id&&x.task_id===task.task_id);
 const row=usage.estimates.rows.find(r=>r.model===p.model.split('/').at(-1)&&r.harness===p.harness&&r.effort===p.effort&&r.feature===features[task.task_id]);
 assert(g.cost_known_runs===276||row?.estimated_api_equivalent_cost_mean_usd>0,'cost coverage '+p.participant_id);
}
console.log('Every displayed scored group has exact or estimated cost and tokens; Pareto P/N/R/X 43/43/42/42');
