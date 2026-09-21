import {defaults,validate,documents,commandText} from './config.mjs';
import {renderArchive} from './archive.mjs?v=bench-1';
let config={...defaults}, toastTimer;
const $=id=>document.getElementById(id);
function iconify(){window.lucide?.createIcons();}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('Copied.');}catch{toast('Clipboard unavailable. Download the configuration instead.');}}
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function collect(){const raw={...config};for(const key of Object.keys(defaults)){if(key==='mode')continue;const el=$(key==='customHarness'?'custom-harness':key);if(el)raw[key]=el.value;}return validate(raw);}
function fill(){for(const[key,value]of Object.entries(config)){const el=$(key==='customHarness'?'custom-harness':key);if(el)el.value=value;}render();}
function render(){
  const suite=config.mode==='suite';document.querySelectorAll('[data-single]').forEach(el=>el.hidden=suite);document.querySelectorAll('[data-suite]').forEach(el=>el.hidden=!suite);
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.mode===config.mode)));
  $('budget-label').textContent=suite?'Evaluations per dimension':'Function evaluations';
  $('task-badge').textContent=suite?'FROZEN LIBRARY SELECTION':'ONE ORACLE INSTANCE';
  $('perturb-field').hidden=!$('feature').value.includes('perturbed_x0');$('noise-field').hidden=!$('feature').value.includes('noisy');
  $('custom-harness-field').hidden=$('harness').value!=='custom';$('model-field').hidden=$('harness').value==='oracle';$('auth-field').hidden=$('harness').value==='oracle';
  try{
    config=collect();const docs=documents(config);$('form-error').hidden=true;
    for(const id of ['download-task','download-agent','copy-command','share-config'])$(id).disabled=false;
    $('plan-title').textContent=suite?`S2MPJ · ${config.mindim}–${config.maxdim}D`:config.problem;
    const known=suite&&config.mindim===1&&config.maxdim===5;
    $('metric-1').textContent=suite?known?'92':'At export':'2';$('metric-1-label').textContent=suite?'problems · resolved on runner':'dimensions';
    $('metric-2').textContent=suite?`${config.budget} × n`:config.budget;$('metric-2-label').textContent='evaluations / session';
    $('metric-3').textContent=suite?known?92*config.repeats:`N × ${config.repeats}`:'1';
    $('feature-name').textContent=$('feature').selectedOptions[0].textContent;
    $('commands').textContent=commandText(config);$('json-preview').textContent=JSON.stringify(docs.task,null,2);
  }catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;for(const id of ['download-task','download-agent','copy-command','share-config'])$(id).disabled=true;}
}
function route(){
  const name=location.hash.slice(1).split('?')[0]||'home';
  const alias={run:'tasks',results:'ranking',protocol:'tasks','problem-histories':'profiles'};
  const resolved=alias[name]||name;
  const selected=['home','ranking','profiles','tasks'].includes(resolved)?resolved:'home';
  document.querySelectorAll('.page').forEach(s=>s.hidden=s.id!==selected);
  document.querySelectorAll('[data-route]').forEach(a=>{
    const active=a.dataset.route===selected;
    a.classList.toggle('active',active);
    if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  $('archive-title').textContent=selected==='ranking'?'Ranking':'Evaluation profiles';
  $('archive-description').textContent=selected==='ranking'
    ?'Evaluation efficiency, ranked within a shared comparison.'
    :'From a single problem to a shared comparison.';
  $('archive-controls').hidden=selected==='tasks'||selected==='home';
  $('archive-error').hidden=true;
  if(selected==='ranking'||selected==='profiles')renderArchive();
  if(name==='problem-histories')$('problem-histories').scrollIntoView();
}
document.querySelector('.skip-link').addEventListener('click',event=>{
  event.preventDefault();$('main').focus();$('main').scrollIntoView();
});
$('configuration').addEventListener('input',render);$('configuration').addEventListener('submit',e=>e.preventDefault());
$('harness').addEventListener('change',()=>{if($('harness').value==='codex')$('model').value='openai/gpt-5.6-sol';else if($('harness').value==='claude-code')$('model').value='anthropic/claude-opus-5';render();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(config.mode===b.dataset.mode)return;config.mode=b.dataset.mode;$('budget').value=config.mode==='suite'?50:100;render();}));
$('download-task').addEventListener('click',()=>download('task.json',documents(collect()).task));$('download-agent').addEventListener('click',()=>download('participant.json',documents(collect()).agent));$('copy-command').addEventListener('click',()=>copy(commandText(collect())));
$('share-config').addEventListener('click',()=>{const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(collect()))));const u=new URL(location.href);u.hash=`tasks?config=${encodeURIComponent(encoded)}`;copy(u.href);});
function restore(){const q=location.hash.split('?')[1];if(q){try{const value=new URLSearchParams(q).get('config');if(value){if(value.length>6000)throw new Error('Configuration link is too large.');config=validate(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)))));fill();}}catch{toast('Invalid configuration link. Defaults retained.');}}}
window.addEventListener('hashchange',()=>{restore();route();});fill();restore();route();window.addEventListener('load',iconify);iconify();
const context=document.modelContext;if(context?.registerTool){
  const controller=new AbortController();
  for(const tool of [{name:'read_benchmark_configuration',description:'Read the current draft task and participant configurations. Does not start a job.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>documents(collect())},{name:'configure_benchmark',description:'Update the visible draft configuration. No model calls, uploads or execution.',inputSchema:{type:'object',properties:{mode:{enum:['single','suite']},feature:{enum:['plain','perturbed_x0','noisy','perturbed_x0+noisy']},maxdim:{type:'integer',minimum:1},budget:{type:'integer',minimum:1},repeats:{type:'integer',minimum:1}},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(Object.keys(input).some(k=>!['mode','feature','maxdim','budget','repeats'].includes(k)))throw new Error('Unknown field');const next=validate({...config,...input});config=next;fill();return documents(config);}}]){try{Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>controller.abort(),{once:true});
}
