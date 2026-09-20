export function taskOptions(catalog,feature){
  return catalog.tasks.filter(task=>task.feature===feature);
}

export function availableRuns(task,repeat,participants){
  return task.runs.filter(run=>run.repetition===repeat&&participants.has(run.participant_id));
}

export function participantLabel(participant){
  return participant.label==='PDFO NEWUOA'?'NEWUOA (PDFO)':participant.label;
}

const SOURCE_CONTEXT={
  'r2-p':'R2 baseline',
  'r2-n':'R2 baseline',
  gpt:'GPT comparison',
  deepseek:'DeepSeek comparison',
  qwen:'Qwen comparison',
};

function archiveContext(participant,catalog,sourceId=null){
  const ids=sourceId?[sourceId]:(participant.sources||[]);
  const contexts=[...new Set(ids.map(id=>SOURCE_CONTEXT[id]).filter(Boolean))];
  if(participant.kind==='classical')return contexts.length===1?contexts[0]:'archived baseline';
  if(participant.configuration_variant==='default-native')return 'R2 default agent';
  if(participant.configuration_variant==='deepseek')return 'Claude Code · thinking off';
  if(participant.configuration_variant==='gpt')return 'Codex · GPT comparison';
  if(participant.configuration_variant==='qwen')return 'Codex · Qwen comparison';
  return contexts.length===1?contexts[0]:(participant.configuration_variant||'agent');
}

export function participantHistoryLabel(participant,catalog,sourceId=null){
  const label=participantLabel(participant);
  return `${label} · ${archiveContext(participant,catalog,sourceId)}`;
}

export function participantGroups(ids,catalog){
  const groups=[];
  for(const id of ids){
    const participant=catalog.participants[id];
    groups.push({label:participantHistoryLabel(participant,catalog),ids:[id]});
  }
  return groups;
}

export function participantEvidence(participant,catalog){
  const sources=participant.sources.map(id=>catalog.sources[id].title||id).join('; ');
  return `Source: ${sources}. Display context: ${archiveContext(participant,catalog)}. Harness: ${participant.harness||'not recorded'}. Solver revision: ${participant.solver_commit||'not recorded'}.`;
}

export function taskHistoryView(task,runs,catalog){
  const series=runs.map(run=>({
    label:participantHistoryLabel(catalog.participants[run.participant_id],catalog,run.source_id),
    legend_key:participantHistoryLabel(catalog.participants[run.participant_id],catalog,run.source_id),
    source_label:catalog.sources[run.source_id].title||run.source_id,
    evidence:participantEvidence(catalog.participants[run.participant_id],catalog),
    n_evals:run.n_evals,x:run.history.evaluations,y:run.history.best_clean,
    run_id:run.id,invalid:run.history.invalid,
  }));
  let min=Infinity,max=-Infinity,positive=true,count=0;
  for(const s of series)for(const y of s.y)if(Number.isFinite(y)){min=Math.min(min,y);max=Math.max(max,y);positive&&=y>0;count++;}
  return {kind:'history',metric:'Best-so-far clean objective',series,
    x_domain:[1,Math.max(1,...series.map(s=>s.n_evals))],
    y_domain:count?[min,max]:[0,1],positive:count>0&&positive};
}

export function pairingStatus(runs){
  const sources=new Set(runs.map(r=>r.source_id));
  if(sources.size>1)return `Exploratory overlay across ${sources.size} evidence sources; source-local instances are not verified as identical or paired.`;
  if(new Set(runs.map(r=>r.instance_id)).size>1)return 'Source-local instances are not verified as identical. Curves are an exploratory overlay, not paired evidence.';
  return 'Single source-local repetition. Actual evaluation counts are preserved; provider health is not inferred from numerical status flags.';
}
