import '../scripts/site/build-site.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {isDisplayed,displayedTask,displayedChart,consumptionView,releaseView,usageFigures}=await import('../_site/bench/results/presentation.mjs');
const {paretoData,paretoFrontier}=await import('../_site/bench/results/usage.mjs');
const {historyChartData}=await import('../_site/bench/results/model.mjs');
const root=new URL('../_site/bench/results/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root)));
const snapshot=read('data/results.json'),usage=read('data/website-usage.json');
const removed=['claude-code--deepseek-v4-flash--low','codex--qwen3.8-flash--low--collaborator-macos',
 'claude-code--qwen3.8-flash--medium','claude-code--mimo-v2.6-flash--off'];
const harness=id=>snapshot.participants.find(p=>p.participant_id===id).harness;
test('retired Chinese configurations are not shipped; displayed groups stay 172',()=>{
 assert(snapshot.participants.every(isDisplayed));
 assert(!snapshot.participants.some(p=>removed.includes(p.participant_id)));
 assert(!snapshot.tasks.some(t=>t.members.some(id=>removed.includes(id))));
 assert.equal(snapshot.tasks.reduce((n,t)=>n+displayedTask(snapshot,t).scores.filter(p=>!['scipy','reference'].includes(harness(p.participant_id))).length,0),172);
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
  assert.deepEqual(scenario.frontier,paretoFrontier(scenario.points));
  assert(scenario.points.filter(p=>p.estimated).every(p=>Number.isFinite(p.x)&&p.estimate.warning.includes('not recovered')));
  const exact=paretoData(snapshot,usage,displayedTask(snapshot,task),'tokens');
  assert.deepEqual(measured.points,exact.points);
 }
 assert.equal(JSON.stringify({snapshot,usage}),before);
});
test('dollar scenarios cover every active group from published list prices, inside the single frontier',()=>{
 const methods=new Set(['same_group_measured_cost_per_token','same_configuration_other_feature_cost_per_token']);
 for(const task of snapshot.tasks){
  const data=consumptionView(snapshot,usage,task,'cost','',true);
  assert.equal(data.points.length,data.eligible);
  assert.deepEqual(data.frontier,paretoFrontier(data.points));
  assert(data.points.filter(p=>p.estimated).every(p=>Number.isFinite(p.x)&&p.x>0&&methods.has(p.estimate.method)));
 }
 const rows=usage.estimates.rows.filter(r=>methods.has(r.cost_method));
 assert(rows.length>0&&rows.every(r=>r.cost_price_sources.length>0&&r.cost_price_sources.every(u=>u.startsWith('https://'))));
});
test('the detail panel reports the plotted value for every point, measured or not',()=>{
 for(const task of snapshot.tasks)for(const metric of ['cost','tokens']){
  const data=consumptionView(snapshot,usage,task,metric,'',true);
  for(const point of data.points){
   const figures=usageFigures(usage,point,task);
   assert.equal(figures[metric],point.x,point.participant.participant_id);
   assert(Number.isFinite(figures[metric==='cost' ? 'totalCost' : 'totalTokens']));
   assert.equal(figures.pricedAt,usage.pricing_as_of);
  }
 }
});
test('missing estimate schema, ambiguous identities and wrong denominators fail closed',()=>{
 const task=snapshot.tasks.find(t=>consumptionView(snapshot,usage,t,'tokens','',true).estimatedCount>0);
 const base=consumptionView(snapshot,usage,task,'tokens'),full=consumptionView(snapshot,usage,task,'tokens','',true);
 const missing=structuredClone(usage);delete missing.estimates;
 assert.equal(consumptionView(snapshot,missing,task,'tokens','',true).points.length,base.points.length);
 const point=full.points.find(p=>p.estimated),bare=point.participant.model.split('/').at(-1);
 const first=usage.estimates.rows.find(r=>r.model===bare&&r.harness===point.participant.harness&&r.effort===point.participant.effort&&r.runs===task.grid.cells&&
  ({'nexteval-u5-perturbed@1':'Perturbed','nexteval-u5-perturbed-noisy@1':'Noisy','nexteval-u5-perturbed-rotated@1':'Rotated','nexteval-u5-perturbed-random-nan@1':'RandomNaN'})[task.task_id]===r.feature);
 const duplicate=structuredClone(usage);duplicate.estimates.rows.push(first);
 assert.equal(consumptionView(snapshot,duplicate,task,'tokens','',true).points.length,full.points.length-1);
 const wrong=structuredClone(usage);wrong.estimates.rows.forEach(r=>r.runs=920);
 assert.equal(consumptionView(snapshot,wrong,task,'tokens','',true).points.length,base.points.length);
});
test('invalid or negative proxy values cannot produce plotted points',()=>{
 const bad=structuredClone(usage);for(const row of bad.estimates.rows){row.estimated_token_mean=-1;row.method='invalid';}
 for(const task of snapshot.tasks)assert.equal(consumptionView(snapshot,bad,task,'tokens','',true).estimatedCount,0);
});
test('release-date plots cover every active group with sourced first-release dates',()=>{
 const releases=read('data/model-releases.json');
 for(const task of snapshot.tasks){
  const view=releaseView(snapshot,releases,task);
  assert.equal(view.points.length,view.eligible);assert.equal(view.omitted,0);
  assert(view.points.every(p=>isDisplayed(p.participant)&&p.release.sources.length>0));
 }
});
test('pairwise profiles and histories carry exactly the displayed curves',()=>{
 const task=snapshot.tasks[0],participants=snapshot.participants,overlay=read('data/pair/overlay.json'),pair=read('data/pair/scores.json');
 const agents=participants.filter(p=>p.participant_id!=='cobyqa').map(p=>p.participant_id).sort();
 assert.equal(snapshot.score_definition.id,'cobyqa-pair-score/1');assert.equal(pair.definition.id,snapshot.score_definition.id);
 for(const t of snapshot.tasks)for(const kind of ['perf','data'])for(const tol of ['0.1','0.001','1e-06','1e-09'])
  assert.deepEqual(Object.keys(overlay.tasks[t.task_id][kind][tol].curves).sort(),agents);
 assert.equal(task.profiles_file,undefined);
 const index=read('data/'+task.history_file),history=read('data/'+index.problems[0].history_file);
 const h=historyChartData(history,participants,0);
 assert.equal(displayedChart(h,participants).series.length,h.series.length);assert.equal(h.series.length,task.members.length);
});
const CAPTION='Usage for some configurations is estimated.';
test('the shipped app applies tier policy and includes estimates with one caption, no per-point marking',()=>{
 const source=readFileSync(new URL('app.mjs',root),'utf8'),flat=source.replace(/\s+/g,'');
 for(const fragment of ['plannedParticipants()).filter(isDisplayed)','displayedChart(historyChartData(','consumptionView(snapshot,usage,task,metric,family,true)',
  'consumptionView(snapshot,usage,t,metric,family,true)','releaseView(snapshot,releases','usageFigures(usage,point,task)'])assert(flat.includes(fragment),fragment);
 assert(!/chartData\(profiles|profiles_file|relativeScore|p<sup>4<\/sup>/.test(source),'no joint profiles or joint display score');
 const start=source.indexOf('function pareto('),rest=source.slice(start+1);
 const view=source.slice(start,start+1+rest.search(/\n(async )?function /));
 assert(view.length>1000 && view.includes('new ParetoChart('));
 assert.equal(source.split(CAPTION).length,2,'exactly one usage caption');
 assert.equal(view.split(CAPTION).length,2,'the caption is on the Pareto view');
 const paretoText=view.replace(CAPTION,'').replace('point.estimate?.sources','').replace('estimated: all.some(p => p.estimated)','');
 for(const pattern of [/estimat/i,/\u2248/,/scenario/i,/hollow/i,/ measured \+/,/MEASURED/])assert(!pattern.test(paretoText),String(pattern));
 for(const pattern of [/scenario/i,/hollow/i,/ measured \+/,/MEASURED/])assert(!pattern.test(source),String(pattern));
 assert(readFileSync(new URL('index.html',root),'utf8').includes("location.replace('../'"));
 const pareto=readFileSync(new URL('pareto.mjs',root),'utf8');
 for(const pattern of [/estimat/i,/scenario/i,/dasharray/])assert(!pattern.test(pareto),String(pattern));
 assert(pareto.includes("r:efficient ? 6 : 3.5"));
});
test('a legacy #ranking or #tasks link redirects to the matrix and still loads the app',()=>{
 const shell=readFileSync(new URL('../index.html',root),'utf8');
 assert(/\n\s*redirectLegacy\(\);\n\s*import\('\.\/results\/app\.mjs\?v=[^']+'\);/.test(shell));
 assert(!shell.includes('if (!redirectLegacy())'));
});
test('the leaderboard ships without case studies, draft answers, hidden configurations or internal wording',async()=>{
 const {notPublic}=await import('../scripts/site/site-check.mjs');
 const shell=readFileSync(new URL('../index.html',root),'utf8');
 assert(shell.includes('href="results/frontier.css?v=')&&shell.includes("import('./results/app.mjs?v="));
 const ui=readFileSync(new URL('frontier.mjs',root),'utf8'),css=readFileSync(new URL('frontier.css',root),'utf8');
 for(const word of ['cards','Case stud','fx-cases','Draft','[Link','Can I run it'])assert(!ui.includes(word),word);
 assert(!ui.includes('agentURL(a)'),'leaderboard links use participant ids');
 assert(!css.includes('fx-card'));
 const view=read('data/leaderboard/view.json');
 assert(!('checks' in view)&&!('cards' in view)&&!('limitations' in view.faults));
 const shown=new Set(snapshot.participants.map(p=>p.participant_id));
 assert(view.agents.every(a=>shown.has(a.id))&&view.agents.length===shown.size-1);
 const text=JSON.stringify(view);for(const id of removed)assert(!text.includes(id),id);
 assert(readFileSync(new URL('app.mjs',root),'utf8').includes('<section id="logos"><h2>Provider logos</h2>'));
 for(const f of ['app.mjs','frontier.mjs','plan.mjs','logos.mjs','data/website-usage.json','data/results.json','data/pair/scores.json','data/leaderboard/view.json'])
  assert.equal(notPublic(readFileSync(new URL(f,root),'utf8')),null,f);
});
