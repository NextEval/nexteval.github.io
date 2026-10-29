import '../scripts/results-storage/prepare-public-results.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const {isDisplayed,displayedTask,displayedChart,consumptionView,releaseView}=await import('../bench/results/presentation.mjs');
const {paretoData}=await import('../bench/results/usage.mjs');
const {chartData,historyChartData}=await import('../bench/results/model.mjs');
const root=new URL('../bench/results/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root)));
const snapshot=read('data/results.json'),usage=read('data/website-usage.json');
const removed=['claude-code--deepseek-v4-flash--low','codex--qwen3.8-flash--low--collaborator-macos',
 'claude-code--qwen3.8-flash--medium','claude-code--mimo-v2.6-flash--off'];
test('all four retired Chinese configurations disappear from presentation, not source records',()=>{
 assert.deepEqual(snapshot.participants.filter(p=>!isDisplayed(p)).map(p=>p.participant_id),removed);
 assert.equal(snapshot.tasks.reduce((n,t)=>n+t.scores.filter(p=>removed.includes(p.participant_id)).length,0),11);
 assert.equal(snapshot.tasks.reduce((n,t)=>n+displayedTask(snapshot,t).scores.filter(p=>!['scipy','reference'].includes(snapshot.participants.find(x=>x.participant_id===p.participant_id).harness)).length,0),159);
 assert(snapshot.participants.filter(p=>p.family==='GPT'||p.model?.includes('claude-')).filter(p=>p.effort==='medium').every(isDisplayed));
 assert(isDisplayed({model:'qwen3.8-max',effort:'high',harness:'codex'}));
 assert(!isDisplayed({model:'qwen3.8-max',effort:'medium',harness:'codex'}));
 assert(!isDisplayed({model:'mimo-v2.6-pro',effort:'off',harness:'codex'}));
});
test('token scenarios cover every active group without modifying measured usage or scores',()=>{
 const before=JSON.stringify({snapshot,usage});
 for(const task of snapshot.tasks){
  const measured=consumptionView(snapshot,usage,task,'tokens');
  const scenario=consumptionView(snapshot,usage,task,'tokens','',true);
  assert.equal(scenario.points.length,scenario.eligible);
  assert.equal(scenario.measuredCount,measured.points.length);
  assert.equal(scenario.estimatedCount,scenario.points.length-measured.points.length);
  assert.deepEqual(scenario.frontier,measured.frontier);
  assert(scenario.scenarioFrontier.length>0);
  assert(scenario.points.filter(p=>p.estimated).every(p=>Number.isFinite(p.x)&&p.estimate.warning.includes('not recovered')));
  assert(scenario.points.every(p=>isDisplayed(p.participant)));
  const exact=paretoData(snapshot,usage,displayedTask(snapshot,task),'tokens');
  assert.deepEqual(measured.points,exact.points);
 }
 assert.equal(JSON.stringify({snapshot,usage}),before);
});
test('dollar estimates do not fabricate prices for the 52 new planning proxies',()=>{
 for(const task of snapshot.tasks){
  const data=consumptionView(snapshot,usage,task,'cost','',true);
  assert(data.points.length<data.eligible);
  assert(data.points.filter(p=>p.estimated).every(p=>p.estimate.method==='same_group_observed_mean_imputation'));
 }
});
test('missing estimate schema, ambiguous identities and wrong denominators fail closed',()=>{
 const task=snapshot.tasks[0],base=consumptionView(snapshot,usage,task,'tokens');
 const missing=structuredClone(usage);delete missing.estimates;
 assert.equal(consumptionView(snapshot,missing,task,'tokens','',true).points.length,base.points.length);
 const first=usage.estimates.rows.find(r=>r.method==='same_family_harness_group_median_proxy');
 const duplicate=structuredClone(usage);duplicate.estimates.rows.push(first);
 assert.equal(consumptionView(snapshot,duplicate,task,'tokens','',true).points.length,base.eligible-1);
 const wrong=structuredClone(usage);wrong.estimates.rows.forEach(r=>r.runs=920);
 assert.equal(consumptionView(snapshot,wrong,task,'tokens','',true).points.length,base.points.length);
});
test('invalid or negative proxy values cannot produce plotted points',()=>{
 const bad=structuredClone(usage);for(const row of bad.estimates.rows){row.estimated_token_mean=-1;row.method='invalid';}
 for(const task of snapshot.tasks)assert.equal(consumptionView(snapshot,bad,task,'tokens','',true).estimatedCount,0);
});
test('release-date plots filter tiers but never invent missing dates',()=>{
 const releases=read('data/model-releases.json');
 for(const task of snapshot.tasks){
  const view=releaseView(snapshot,releases,task);
  assert.equal(view.points.length,17);assert(view.points.every(p=>isDisplayed(p.participant)));
  assert(view.omitted>0);
 }
});
test('profiles and histories omit retired curves without changing raw exports',()=>{
 const task=snapshot.tasks[0],profiles=read('data/'+task.profiles_file),participants=snapshot.participants;
 const data=chartData(profiles,task,participants,'performance',profiles.tolerances[0].tolerance);
 const result=displayedChart(data,participants);
 assert.equal(result.series.length,displayedTask(snapshot,task).scores.length);
 assert.equal(data.series.length,task.members.length);
 const index=read('data/'+task.history_file),history=read('data/'+index.problems[0].history_file);
 const h=historyChartData(history,participants,0),visible=displayedChart(h,participants);
 assert.equal(visible.series.length,result.series.length);assert.equal(h.series.length,task.members.length);
});
test('the actual app applies tier policy to each view and wires estimate controls',()=>{
 const source=readFileSync(new URL('app.mjs',root),'utf8');
 for(const fragment of ['plannedParticipants()).filter(isDisplayed)','displayedChart(chartData(',
  'displayedChart(historyChartData(','consumptionView(snapshot,usage','releaseView(snapshot,releases',
  'id="pareto-estimates"','point.estimated'])assert(source.includes(fragment),fragment);
 assert(!readFileSync(new URL('index.html',root),'utf8').includes('Full ten-repeat archive'));
 assert(readFileSync(new URL('archive/ten-repeat/index.html',root),'utf8').includes("location.replace('../../index.html#matrix')"));
 const pareto=readFileSync(new URL('pareto.mjs',root),'utf8');
 assert(!pareto.includes('pareto-estimate-dot'));
 assert(pareto.includes("node('circle',{r:efficient ? 6 : 3.5"));
});
test('UI overlay rejects tampered manifests, sources and symbolic-link targets',()=>{
 execFileSync('python3',['-m','unittest','test_presentation_overlay.py'],{cwd:new URL('../scripts/results-storage/',import.meta.url),stdio:'pipe'});
});
