import '../scripts/results-storage/prepare-public-results.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../bench/results/',import.meta.url);
const snapshot=JSON.parse(await readFile(new URL('data/results.json',root),'utf8'));
const usage=JSON.parse(await readFile(new URL('data/website-usage.json',root),'utf8'));
const {paretoData,validateUsage}=await import(new URL('usage.mjs',root));validateUsage(usage);
assert.equal(usage.groups.length,170);assert(usage.groups.every(g=>g.runs===276));
const expected={"nexteval-u5-perturbed-noisy@1": {"cost": 20, "tokens": 26}, "nexteval-u5-perturbed-random-nan@1": {"cost": 15, "tokens": 22}, "nexteval-u5-perturbed-rotated@1": {"cost": 19, "tokens": 27}, "nexteval-u5-perturbed@1": {"cost": 20, "tokens": 27}};
for(const task of snapshot.tasks)for(const metric of ['cost','tokens'])assert.equal(paretoData(snapshot,usage,task,metric).points.length,expected[task.task_id][metric]);
const statuses={"complete": 74, "incomplete": 68, "tokens_only": 28};
for(const [status,count] of Object.entries(statuses))assert.equal(usage.groups.filter(g=>g.accounting_status===status).length,count);
for(const group of usage.groups){if(group.usage_known_runs<276)assert.equal(group.total_tokens,null);if(group.cost_known_runs<276)assert.equal(group.total_api_equivalent_cost_usd,null);}
console.log('Primary109 exact accounting coverage and separate token/cost eligibility passed');

assert.equal(usage.estimates.rows.length,68);assert(usage.estimates.rows.every(r=>r.estimate_is_not_exact===true));assert.equal(usage.groups.filter(g=>g.accounting_status==='incomplete'&&g.total_tokens===null).length,68);
const proxies=usage.estimates.rows.filter(r=>r.reliability==='planning_scenario_only_not_recovered_usage');
assert.equal(proxies.length,52);assert(proxies.every(r=>r.known_tokens===0&&r.known_cost===0&&r.donor_groups>0&&r.estimated_api_equivalent_cost_mean_usd===null));
