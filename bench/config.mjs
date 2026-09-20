export const defaults = Object.freeze({mode:'single',problem:'CLIFF',library:'s2mpj',mindim:1,maxdim:5,feature:'plain',perturbation:0.03,noise:0.001,budget:100,seed:7,repeats:3,walltime:60,harness:'claude-code',customHarness:'',model:'anthropic/claude-opus-5',auth:'api_key',concurrency:1});
const features = new Set(['plain','perturbed_x0','noisy','perturbed_x0+noisy']);
const fields = new Set(Object.keys(defaults));
function integer(value, label, minimum=1) { const n=Number(value); if(value==='' || !Number.isSafeInteger(n) || n<minimum) throw new Error(`${label} must be an integer of at least ${minimum}.`); return n; }
function nonnegative(value,label){const n=Number(value);if(value===''||!Number.isFinite(n)||n<0)throw new Error(`${label} must be a finite, nonnegative number.`);return n;}
export function validate(input){
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid configuration.');
  if(Object.keys(input).some(k=>!fields.has(k))) throw new Error('Unknown configuration field.');
  const c={...defaults,...input};
  if(!['single','suite'].includes(c.mode)||!features.has(c.feature)||c.library!=='s2mpj')throw new Error('Unsupported task or feature.');
  if(!['CLIFF','ROSENBR','BOXBODLS','SNAIL'].includes(c.problem))throw new Error('Choose a development function.');
  for(const k of ['budget','mindim','maxdim','repeats','walltime','concurrency'])c[k]=integer(c[k],k);
  c.seed=integer(c.seed,'Seed',0);if(c.mindim>c.maxdim)throw new Error('Minimum dimension cannot exceed maximum dimension.');
  c.perturbation=nonnegative(c.perturbation,'Perturbation level');c.noise=nonnegative(c.noise,'Noise level');
  if(!['claude-code','codex','terminus-2','oracle','custom'].includes(c.harness))throw new Error('Unsupported harness.');
  if(!['api_key','coding_plan'].includes(c.auth))throw new Error('Unsupported authentication mode.');
  if(c.harness==='custom'&&!/^[A-Za-z_][A-Za-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*$/.test(c.customHarness))throw new Error('Use a Python import path such as package.module:Agent.');
  if(typeof c.model!=='string'||!c.model.trim()||c.model.length>200)throw new Error('A model ID is required.');
  if(/(?:sk-|ark-|bearer\s|token=|api[_-]?key=)/i.test(c.model))throw new Error('Enter a model ID, never a credential.');
  if(!/^[A-Za-z0-9_.:/-]+$/.test(c.model))throw new Error('Model ID contains unsupported characters.');
  return c;
}
export function documents(input){
  const c=validate(input), selected=[];
  if(c.feature.includes('perturbed_x0'))selected.push({name:'perturbed_x0',options:{perturbation_level:c.perturbation,distribution:'spherical'}});
  if(c.feature.includes('noisy'))selected.push({name:'noisy',options:{noise_level:c.noise,noise_type:'mixed',noise_mode:'random',distribution:'gaussian'}});
  if(c.feature==='plain')selected.push({name:'plain',options:{}});
  const claude=c.harness==='claude-code';
  const shared={revision:'1',features:selected,scoring:{clean_reference:'clean_function'},runtime:{agent_image:claude?'nexteval-bench-claude-code:2.1.269-20260912':'python:3.12-slim',agent_network_mode:'public',cpus:2,memory_mb:2048},metadata:{purpose:'public-development',portal_protocol:'preview-20260912'}};
  const task=c.mode==='single'?{schema:'nexteval-bench.single-function/1',id:`single-${c.problem.toLowerCase()}-${c.feature.replaceAll('+','-')}`,...shared,problem:{source:'s2mpj',name:c.problem},seed:c.seed,budget:{evaluations:c.budget,wall_time_s:c.walltime*60}}:{schema:'nexteval-bench.function-suite/1',id:`suite-s2mpj-${c.feature.replaceAll('+','-')}`,...shared,problem_set:{source:'s2mpj',selection:{mindim:c.mindim,maxdim:c.maxdim,excludelist:[]}},repeats:{count:c.repeats,seed_base:c.seed},budget:{evaluations:{mode:'per_dimension',factor:c.budget,offset:0,minimum:1},wall_time_s:c.walltime*60},scoring:{clean_reference:'clean_function',profiles:{max_tol_order:6,normalized_scores:true,summarize_output_based_profiles:true,missing_trial_policy:'fail'}}};
  const isOracle=c.harness==='oracle';
  const agent={schema:'nexteval-bench.agent-run/1',id:isOracle?'reference-smoke':`${c.harness}-participant`,harness:{name:c.harness==='custom'?'custom':c.harness,import_path:c.harness==='custom'?c.customHarness:null,version:''},model:{name:isOracle?null:c.model,provider:isOracle?'none':c.model.includes('/')?c.model.split('/')[0]:'runner-configured',revision:isOracle?'none':c.model},limits:{reasoning_effort:null,max_turns:null,max_thinking_tokens:null,max_output_tokens:null,extra_kwargs:{}},auth:{mode:isOracle?'none':c.auth},attempts:1,n_concurrent:c.concurrency};
  if(claude){agent.harness.version='2.1.269';agent.limits.extra_kwargs.version='2.1.269';}
  return {task,agent};
}
export function commandText(input){
  const c=validate(input), op=c.mode==='single'?'export-single':'export-suite';
  const imageBuild=c.harness==='claude-code'?'\n# Preinstall the official pinned Claude CLI; no credentials in the image\ndocker build -t nexteval-bench-claude-code:2.1.269-20260912 environments/claude-code\n':'';
  const aggregate=c.mode==='suite'?'\n\n# Compare this bundle with another participant on the same frozen suite\nnexteval-bench levels aggregate task.json results.json other-results.json \\\n  --out profiles':'';
  return `# 01  Development candidate; Linux + Docker and repository access required\ngit clone --branch codex/bench-solver-pin-20260913 https://github.com/NextEval/nexteval-bench.git\ncd nexteval-bench\nuv venv --python 3.12\n. .venv/bin/activate\nuv pip install -e '.[dev]' 'harbor==0.22.0'\ngit clone https://github.com/NextEval/nexteval.git nexteval-runtime\ngit -C nexteval-runtime checkout --detach 440b8139bd5fae28f0bf7a84eb010d02c17dc92a\nuv build --wheel nexteval-runtime --out-dir wheels\n${imageBuild}\n# 02  Download both JSON files into this checkout, then export\nnexteval-bench levels validate task.json\nnexteval-bench levels ${op} task.json \\\n  --nexteval-wheel wheels/nexteval-0.7.1-py3-none-any.whl \\\n  --out tasks/nexteval\n\n# 03  Configure the selected Harbor adapter's authentication on this host\n# One persistent agent session per task\nnexteval-bench levels job participant.json \\\n  --tasks tasks/nexteval --out job.json \\\n  --job-name nexteval-run\nharbor run -c job.json\n\n# 04  Collect trusted records, then inspect the complete session\nnexteval-bench levels collect jobs/nexteval-run \\\n  --index tasks/nexteval/INDEX.json \\\n  --participant participant-a --out results.json\nharbor view jobs${aggregate}`;
}
