import {participantFamily} from './plan.mjs';
import {featureFor} from './model.mjs';
import {paretoData,paretoFrontier} from './usage.mjs';
import {releaseData} from './releases.mjs';
import {relativeScore,referenceScore} from './scores.mjs';

const CHINESE = new Set(['Qwen','DeepSeek','GLM','Hunyuan','MiMo','Kimi']);
const bare = model => String(model || '').split('/').at(-1);
export function isDisplayed(participant) {
  if (!participant) return false;
  const family = participantFamily(participant);
  return !CHINESE.has(family) || participant.effort === (family === 'MiMo' ? 'on' : 'high');
}
export function displayedTask(snapshot,task) {
  const active = new Set(snapshot.participants.filter(isDisplayed).map(p=>p.participant_id));
  return {...task,scores:task.scores.filter(p=>active.has(p.participant_id))};
}
export function displayedChart(data,participants) {
  const labels = new Set(participants.filter(isDisplayed).map(p=>p.label));
  const series = data.series.filter(s=>labels.has(s.label));
  if (!data.y_domain) return {...data,series};
  const values = series.flatMap(s=>s.y.filter(Number.isFinite));
  return {...data,series,y_domain:values.length ? [Math.min(...values),Math.max(...values)] : [0,1],
    positive:values.length>0 && values.every(v=>v>0)};
}
const featureName = task => ({perturbed:'Perturbed',noisy:'Noisy',rotated:'Rotated',random_nan:'RandomNaN'})[featureFor(task)?.key];
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function estimateFor(usage,participant,task,metric) {
  if (usage?.estimates?.schema !== 'nexteval.separate-usage-scenarios/1') return null;
  const rows = usage.estimates.rows.filter(r=>r.model===bare(participant.model)
    && r.harness===participant.harness && r.effort===participant.effort
    && r.feature===featureName(task) && r.runs===task.grid.cells);
  if (rows.length !== 1) return null;
  const row=rows[0];
  let value=metric==='tokens' ? row.estimated_token_mean : row.estimated_api_equivalent_cost_mean_usd;
  const range=metric==='tokens' ? row.missing_token_observed_min_max_scenarios || row.cross_feature_reference_mean_range : null;
  let method=row.method;
  if (!finite(value) && metric==='tokens' && row.method==='same_exact_configuration_other_feature_scenario'
      && Array.isArray(range) && range.length===2 && range.every(finite) && range[0]<=range[1]) {
    value=(range[0]+range[1])/2;method='same_configuration_other_feature_range_midpoint';
  }
  if (!finite(value)) return null;
  if (metric==='cost' && !/^\d{4}-\d{2}-\d{2}$/.test(usage.pricing_as_of || '')) return null;
  return {value,method,reliability:row.reliability || 'planning_only',range,
    warning:'Estimate, not recovered metered usage. Donor ranges are not confidence intervals.'};
}
export function consumptionView(snapshot,usage,task,metric='cost',family='',includeEstimates=false) {
  const visible=displayedTask(snapshot,task);
  const measured=paretoData(snapshot,usage,visible,metric,family);
  const points=[...measured.points],present=new Set(points.map(p=>p.participant.participant_id));
  if (includeEstimates && !measured.mixedPricing) {
    const groups=new Map((usage?.groups || []).filter(g=>g.task_id===task.task_id).map(g=>[g.participant_id,g]));
    for (const row of visible.scores) {
      const participant=snapshot.participants.find(p=>p.participant_id===row.participant_id);
      if (!participant || present.has(participant.participant_id) || ['scipy','reference'].includes(participant.harness)
          || family && participantFamily(participant)!==family) continue;
      const estimate=estimateFor(usage,participant,task,metric);
      const score=relativeScore(row.score,referenceScore(task));
      if (estimate && score!==null) points.push({participant,group:groups.get(participant.participant_id) || null,
        x:estimate.value,score,estimated:true,estimate});
    }
  }
  points.sort((a,b)=>b.score-a.score || a.x-b.x || a.participant.participant_id.localeCompare(b.participant.participant_id));
  return {...measured,points,measuredCount:measured.points.length,
    estimatedCount:points.filter(p=>p.estimated).length,omitted:measured.eligible-points.length,
    scenarioFrontier:points.some(p=>p.estimated) ? paretoFrontier(points) : []};
}
export function releaseView(snapshot,releases,task,family='',usage=null) {
  return releaseData(snapshot,releases,displayedTask(snapshot,task),family,usage);
}
