import {ScientificChart,formatNumber} from './charts.mjs?v=legend-3';
import {taskOptions,availableRuns,taskHistoryView,pairingStatus,participantLabel,participantGroups,participantEvidence} from './catalog.mjs?v=history-4';
import {selectionMask,subsetPath,loadComparison,participantOrder} from './comparisons.mjs?v=comparison-1';

const $=id=>document.getElementById(id);
const chart=new ScientificChart($('profile-chart')),historyChart=new ScientificChart($('history-chart'));
const cache=new Map();
let catalog,studies,comparisons,scope,applied,plot='performance',request=0,historyRequest=0,currentTask,selected=new Set(),viewState={};
const comparisonCache=new Map();
async function read(path){if(!cache.has(path)){const r=await fetch(path);if(!r.ok)throw new Error(`Missing data: ${path}`);cache.set(path,await r.json());}return cache.get(path);}
const family=()=>$('archive-feature').value;
function readViewState(){
  const query=new URLSearchParams(location.hash.split('?')[1]||'');
  viewState={feature:query.get('feature'),study:query.get('study'),problem:query.get('problem'),run:query.get('run'),plot:query.get('plot'),mask:query.get('mask')};
  if(['perturbed_x0','perturbed_x0+noisy'].includes(viewState.feature))$('archive-feature').value=viewState.feature;
  if(['performance','data'].includes(viewState.plot))plot=viewState.plot;
}
function writeViewState(){
  const query=new URLSearchParams({feature:family(),study:$('study').value,problem:$('history-problem').value,run:$('history-run').value,plot,mask:String(applied?.mask||selectionMask(chosenIndices(),scope.participants.length))});
  const url=new URL(location.href);url.hash=`profiles?${query}`;
  Promise.resolve(navigator.clipboard?.writeText(url.href)).then(()=>{$('toast').textContent='Reproducible view link copied';$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1800);}).catch(()=>{$('toast').textContent='Link ready in the address bar';$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1800);});
}
function cells(row,values){for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}}

function showRuns(){
  if(!currentTask)return;
  const repeat=Number($('history-run').value),runs=availableRuns(currentTask,repeat,selected);
  $('history-figure').hidden=!runs.length;$('history-table').hidden=!runs.length;
  $('history-empty').hidden=runs.length>0;
  $('history-empty').textContent='No saved run for this participant selection and repetition.';
  $('participant-count').textContent=`(${selected.size} selected)`;
  if(!runs.length){$('history-pairing').textContent='';return;}
  historyChart.set(taskHistoryView(currentTask,runs,catalog),'history');
  $('history-pairing').textContent=pairingStatus(runs);
  $('history-caption').textContent=`${currentTask.problem} · ${currentTask.dimension}D · repetition ${repeat}. ${new Set(runs.map(r=>r.source_id)).size} evidence sources, ${runs.length} recorded runs.`;
  $('history-summary').replaceChildren();
  for(const run of runs){
    const p=catalog.participants[run.participant_id],source=catalog.sources[run.source_id];
    const best=run.history.best_clean.findLast(Number.isFinite),status=run.status;
    let outcome=status.abnormal_termination_recorded?'Abnormal termination recorded':!run.n_evals?'No evaluations':!Number.isFinite(best)?'No finite value':run.n_evals<run.budget?'Stopped before budget':'Budget reached';
    if(run.history.invalid.length)outcome+=` · ${run.history.invalid.length} nonfinite`;
    if(status.output_fallback_recorded)outcome+=' · output fallback';
    const tr=document.createElement('tr');
    cells(tr,[participantLabel(p),formatNumber(best),`${run.n_evals} / ${run.budget}`,outcome]);
    tr.firstChild.title=participantEvidence(p,catalog);
    const td=document.createElement('td'),a=document.createElement('a');
    a.textContent=source.title||run.source_id;a.href=source.url;a.target='_blank';a.rel='noopener';
    a.title=`${source.feature_stamp} · run ${run.id}`;td.append(a);tr.append(td);$('history-summary').append(tr);
  }
}

async function showTask(){
  const revision=++historyRequest,entry=taskOptions(catalog,family()).find(t=>t.id===$('history-problem').value);
  $('history-figure').hidden=true;$('history-table').hidden=true;$('history-data').hidden=true;
  $('history-empty').hidden=false;$('history-empty').textContent='Loading recorded evaluations...';
  try{
    const task=await read(`assets/catalog/${entry.file}`);if(revision!==historyRequest)return;
    const previous=currentTask?.id;currentTask=task;
    const pids=[...new Set(task.runs.map(r=>r.participant_id))];
    if(previous!==task.id){
      const preferredId=family()==='perturbed_x0'?'r2-p':family()==='perturbed_x0+noisy'?'r2-n':null;
      const preferred=catalog.profile_views?.find(view=>view.id===preferredId);
      selected=new Set((preferred?.participant_ids||pids).filter(id=>pids.includes(id)));
      const repeats=Math.max(...task.runs.map(r=>r.repetition));
      const repeat=Math.min(Number($('history-run').value)||1,repeats);
      $('history-run').replaceChildren(...Array.from({length:repeats},(_,i)=>new Option(String(i+1),String(i+1))));$('history-run').value=String(repeat);
      $('history-participants').replaceChildren();
      for(const group of participantGroups(pids,catalog)){
        const el=document.createElement('label'),input=document.createElement('input');
        input.type='checkbox';input.checked=group.ids.some(pid=>selected.has(pid));input.value=group.label;
        input.addEventListener('change',()=>{for(const pid of group.ids)input.checked?selected.add(pid):selected.delete(pid);showRuns();});
        el.title=group.ids.map(pid=>participantEvidence(catalog.participants[pid],catalog)).join('\n');
        el.append(input,document.createTextNode(group.label));$('history-participants').append(el);
      }
    }
    $('history-facts').textContent=`${task.runs.length} saved runs · ${pids.length} participant configurations · ${selected.size} shown by default · ${Object.keys(task.variants).length} feature settings`;
    $('history-settings').replaceChildren(...[...new Set(task.runs.map(r=>r.source_id))].map(id=>{const li=document.createElement('li');li.textContent=`${id}: ${catalog.sources[id].feature_stamp}`;return li;}));
    $('history-data').href=`assets/catalog/${entry.file}`;$('history-data').hidden=false;
    showRuns();
  }catch{if(revision!==historyRequest)return;currentTask=null;$('history-empty').textContent='Task evidence unavailable. No replacement curve has been supplied.';}
}

function updateTaskOptions(){
  const previous=currentTask?.problem,options=taskOptions(catalog,family());
  $('history-problem').replaceChildren(...options.map(t=>new Option(`${t.problem} · ${t.dimension}D`,t.id)));
  $('history-problem').value=(options.find(t=>t.id===viewState.problem)||options.find(t=>t.problem===(previous||'ROSENBR'))||options[0]).id;
  const pids=new Set(options.flatMap(t=>t.participant_ids));
  $('result-facts').textContent=`${options.length} problem tasks · ${pids.size} participant configurations · ${options.reduce((n,t)=>n+t.run_count,0)} saved runs`;
  showTask();
}

function chosenIndices(){return [...$('comparison-solvers').querySelectorAll('input:checked')].map(x=>Number(x.value));}

function updateSelection(){
  const indices=chosenIndices();
  $('comparison-count').textContent=`(${indices.length} of ${scope.participants.length})`;
  let mask;
  try{mask=selectionMask(indices,scope.participants.length);}catch{
    $('comparison-apply').disabled=true;$('comparison-status').textContent='At least two solvers are required. The displayed comparison is unchanged.';return;
  }
  const unchanged=applied?.scope===scope.id&&applied.mask===mask;
  $('comparison-apply').disabled=unchanged;
  $('comparison-status').textContent=unchanged?'Applied comparison':`Pending selection: ${indices.length} solvers. Displayed profiles and scores are unchanged.`;
}

function showProfile(){
  if(!applied)return;
  const {data,scope:scopeId,mask}=applied,current=comparisons.scopes.find(s=>s.id===scopeId);
  const order=participantOrder(current).filter(i=>data.indices.includes(i));
  chart.set({...data.profiles[plot],series:order.map(i=>data.profiles[plot].series[data.indices.indexOf(i)])},plot);$('profile-chart').hidden=false;
  $('score-rows').replaceChildren();
  data.scores.map((score,i)=>({score,label:current.participants[data.indices[i]].label})).sort((a,b)=>b.score-a.score).forEach((r,i)=>{const tr=document.createElement('tr');cells(tr,[String(i+1).padStart(2,'0'),r.label,r.score.toFixed(4)]);$('score-rows').append(tr);});
  const excluded=current.excluded_from_union?.length||0;
  const nonfinite=current.nonfinite_initial_pairs||0;
  const facts=`${current.problems} common problems · ${current.repeats} repetitions · ${data.indices.length} solvers · 50 × n evaluations${excluded?` · ${excluded} excluded`:''}${nonfinite?` · ${nonfinite} nonfinite initial pairs`:''}`;
  $('comparison-facts').textContent=facts;
  $('result-caveat').textContent=`${facts}. ${current.caveat}`;
  $('profile-caveat').textContent=current.caveat;
  $('profile-data').href=subsetPath(current,mask);$('profile-hdf5').href=current.artifact;
  for(const id of ['profile-data','profile-hdf5','profile-method'])$(id).hidden=false;
  const legacy=current.legacy_view&&mask===selectionMask(current.default_indices,current.participants.length);
  $('profile-pdf').hidden=!legacy;
  if(legacy)$('profile-pdf').href=`assets/${studies[current.legacy_view].asset}-${plot}.pdf`;
  $('curve-status').textContent='Tolerance 10⁻⁶ · OptiProfiler · mean with min–max envelope across repetitions, not a confidence interval.';
  $('profile-method-text').textContent='For each problem and repetition, f_ref is the minimum clean objective over the selected solvers’ evaluated histories and the initial point. The target is max(τ f₀ + (1 − τ) f_ref, f_ref). Performance ratios divide evaluations-to-target by the fastest selected solver; data profiles divide by n + 1. Scores integrate history performance profiles, normalize within the selected set at each tolerance, and average ten tolerances from 10⁻¹ to 10⁻¹⁰. Legend visibility never changes this comparison.';
  $('comparison-protocol').textContent=`${current.repetition_policy}. ${current.alignment_policy} ${current.baseline_policy} ${current.nonfinite_initial_pairs?`${current.nonfinite_initial_pairs} nonfinite-initial problem/repetition pairs retain the original OptiProfiler convention (infinite target); inspect the archive before interpreting those cases.`:''}`;
}

async function applyComparison(){
  let mask;try{mask=selectionMask(chosenIndices(),scope.participants.length);}catch{updateSelection();return;}
  const revision=++request,current=scope,key=`${current.id}/${mask}`;
  applied=null;$('comparison-apply').disabled=true;
  $('profile-chart').hidden=true;$('score-rows').replaceChildren();
  for(const id of ['profile-data','profile-hdf5','profile-method','profile-pdf'])$(id).hidden=true;
  $('comparison-facts').textContent='';$('profile-caveat').textContent='';$('result-caveat').textContent='';
  $('comparison-status').textContent='Loading recomputed comparison...';$('curve-status').textContent='Loading recomputed comparison...';
  try{
    const data=comparisonCache.get(key)||await loadComparison(current,mask);
    comparisonCache.set(key,data);if(revision!==request)return;
    applied={data,scope:current.id,mask};showProfile();updateSelection();
  }catch(error){
    if(revision!==request)return;
    $('comparison-status').textContent=`Comparison unavailable: ${error.message}. No old scores or substitute curves are shown.`;
    $('curve-status').textContent=$('comparison-status').textContent;$('comparison-apply').disabled=false;
  }
}

function chooseScope(){
  scope=comparisons.scopes.find(s=>s.id===$('study').value);
  $('comparison-solvers').replaceChildren();
  participantOrder(scope).forEach(i=>{
    const p=scope.participants[i];
    const el=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';const requestedMask=Number(viewState.mask);input.checked=Number.isInteger(requestedMask)&&requestedMask>0?Boolean(requestedMask&(1<<i)):scope.default_indices.includes(i);input.value=String(i);
    input.addEventListener('change',updateSelection);
    el.title=[catalog.sources[p.source].title,p.harness,`source column ${p.column}`].filter(Boolean).join(' · ');
    el.append(input,document.createTextNode(p.label));$('comparison-solvers').append(el);
  });
  applyComparison();
}

function updateProfileOptions(){
  const previous=$('study').value,views=comparisons.scopes.filter(v=>v.feature===family());
  $('study').replaceChildren(...views.map(v=>new Option(v.title,v.id)));
  if(views.some(v=>v.id===viewState.study))$('study').value=viewState.study;
  else if(views.some(v=>v.id===previous))$('study').value=previous;
  chooseScope();
}

let initialization;
export async function renderArchive(){
  try{
    readViewState();
    initialization??=(async()=>{catalog=await read('assets/catalog/index.json');studies=await read('assets/studies.json');comparisons=await read('assets/comparisons/index.json');
      if(!comparisons.complete)throw new Error('Incomplete profile export');
      $('catalog-coverage').textContent=`${catalog.counts.problems} problems, ${catalog.counts.tasks} problem-feature tasks, ${catalog.counts.runs} runs from ${catalog.counts.sources} numeric archives. ${catalog.scope}.`;
      updateTaskOptions();updateProfileOptions();if(viewState.run&&Number.isInteger(Number(viewState.run)))$('history-run').value=viewState.run;showTask();})();
    await initialization;
  }catch(error){
    initialization=null;
    $('archive-error').textContent=location.protocol==='file:'
      ? 'Interactive charts need an HTTP preview or the hosted Bench URL. Opening dist/index.html directly as file:// blocks the research data fetches.'
      : `Research assets could not be loaded: ${error.message}`;
    $('archive-error').hidden=false;
  }
}
$('archive-feature').addEventListener('change',()=>{if(!catalog)return;updateTaskOptions();updateProfileOptions();});
$('history-problem').addEventListener('change',showTask);$('history-run').addEventListener('change',showRuns);$('study').addEventListener('change',chooseScope);
$('comparison-apply').addEventListener('click',applyComparison);
$('share-view').addEventListener('click',writeViewState);
$('comparison-all').addEventListener('click',()=>{$('comparison-solvers').querySelectorAll('input').forEach(x=>x.checked=true);updateSelection();});
$('comparison-default').addEventListener('click',()=>{$('comparison-solvers').querySelectorAll('input').forEach(x=>x.checked=scope.default_indices.includes(Number(x.value)));updateSelection();});
document.querySelectorAll('[data-plot]').forEach(b=>b.addEventListener('click',()=>{plot=b.dataset.plot;document.querySelectorAll('[data-plot]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));showProfile();}));
