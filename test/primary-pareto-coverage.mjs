import '../scripts/results-storage/prepare-public-results.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../bench/results/',import.meta.url);
const snapshot=JSON.parse(await readFile(new URL('data/results.json',root),'utf8'));
const usage=JSON.parse(await readFile(new URL('data/website-usage.json',root),'utf8'));
const {paretoData,validateUsage}=await import(new URL('usage.mjs',root));validateUsage(usage);
assert.equal(usage.groups.length,179);assert(usage.groups.every(g=>g.runs===276));
const expected={"nexteval-u5-perturbed-noisy@1": {"cost": 20, "tokens": 36}, "nexteval-u5-perturbed-random-nan@1": {"cost": 15, "tokens": 35}, "nexteval-u5-perturbed-rotated@1": {"cost": 19, "tokens": 38}, "nexteval-u5-perturbed@1": {"cost": 20, "tokens": 38}};
for(const task of snapshot.tasks)for(const metric of ['cost','tokens'])assert.equal(paretoData(snapshot,usage,task,metric).points.length,expected[task.task_id][metric]);
const statuses={"complete": 74, "incomplete": 32, "tokens_only": 73};
for(const [status,count] of Object.entries(statuses))assert.equal(usage.groups.filter(g=>g.accounting_status===status).length,count);
for(const group of usage.groups){if(group.usage_known_runs<276)assert.equal(group.total_tokens,null);if(group.cost_known_runs<276)assert.equal(group.total_api_equivalent_cost_usd,null);}
console.log('Primary109 exact accounting coverage and separate token/cost eligibility passed');

assert.equal(usage.estimates.rows.length,105);assert(usage.estimates.rows.every(r=>r.estimate_is_not_exact===true));assert.equal(usage.groups.filter(g=>g.accounting_status==='incomplete'&&g.total_tokens===null).length,32);
const proxies=usage.estimates.rows.filter(r=>r.reliability==='planning_scenario_only_not_recovered_usage'&&r.donor_groups>0);
assert.equal(proxies.length,15);assert(proxies.every(r=>r.known_tokens===0&&r.known_cost===0&&r.estimated_api_equivalent_cost_mean_usd>0&&r.cost_method));
const participants=new Map(snapshot.participants.map(p=>[p.participant_id,p])),features={'nexteval-u5-perturbed@1':'Perturbed','nexteval-u5-perturbed-noisy@1':'Noisy','nexteval-u5-perturbed-rotated@1':'Rotated','nexteval-u5-perturbed-random-nan@1':'RandomNaN'};
for(const task of snapshot.tasks)for(const score of task.scores){
 const p=participants.get(score.participant_id);if(['scipy','reference'].includes(p.harness))continue;
 const g=usage.groups.find(x=>x.participant_id===p.participant_id&&x.task_id===task.task_id);
 const row=usage.estimates.rows.find(r=>r.model===p.model.split('/').at(-1)&&r.harness===p.harness&&r.effort===p.effort&&r.feature===features[task.task_id]);
 assert(g.cost_known_runs===276||row?.estimated_api_equivalent_cost_mean_usd>0,'cost coverage '+p.participant_id);
}
console.log('Every scored group has exact or labeled estimated cost and tokens');
