import { relativeScore, referenceScore } from './scores.mjs';

const key = row => JSON.stringify([row.participant_id, row.task_id]);
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const matchesMean = (mean, total, runs) => nonnegative(mean) && nonnegative(total)
  && Math.abs(mean * runs - total) <= Math.max(1e-6, total * 1e-8);

export function pricingLinks(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.flatMap(source => {
    const url = typeof source === 'string' ? source : source?.url;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' ? [{url:parsed.href, label:source?.title || parsed.hostname}] : [];
    } catch { return []; }
  });
}

export function validateUsage(data) {
  if (data?.schema !== 'nexteval.website-usage/1' || !Array.isArray(data.groups)) throw new Error('Unsupported usage snapshot');
  const seen = new Set();
  for (const row of data.groups) {
    if (!row.participant_id || !row.task_id || seen.has(key(row))) throw new Error('Missing or duplicate usage identity');
    seen.add(key(row));
    if (!Number.isInteger(row.runs) || row.runs <= 0 || !row.accounting_status) throw new Error('Missing accounting coverage');
    for (const [mean, total] of [['mean_total_tokens_per_run','total_tokens'], ['mean_api_equivalent_cost_usd_per_run','total_api_equivalent_cost_usd']]) {
      if ((row[mean] != null || row[total] != null) && !matchesMean(row[mean],row[total],row.runs)) throw new Error('Usage total and mean disagree');
    }
  }
  return data;
}

export function paretoFrontier(points) {
  return points.filter(point => !points.some(other => other.x <= point.x && other.score >= point.score
    && (other.x < point.x || other.score > point.score))).sort((a,b) => a.x-b.x || b.score-a.score);
}

export function paretoData(snapshot, usage, task, metric = 'cost', family = '') {
  const participants = new Map(snapshot.participants.map(p => [p.participant_id,p]));
  const groups = new Map((usage?.groups || []).map(row => [key(row),row]));
  const eligible = task.scores.filter(row => {
    const p = participants.get(row.participant_id);
    return p && p.harness !== 'scipy' && p.harness !== 'reference' && (!family || p.family === family);
  });
  const candidates = eligible.flatMap(row => {
    const group = groups.get(key({...row,task_id:task.task_id}));
    if (!group || group.runs !== task.grid.cells) return [];
    const status = typeof group.accounting_status === 'string' ? group.accounting_status : '';
    const tokenReady = ['complete','verified','ready','tokens_complete','tokens_verified','tokens_only'].includes(status)
      || group.accounting_status?.tokens === 'complete';
    if (!tokenReady) return [];
    if (group.usage_known_runs != null && group.usage_known_runs !== group.runs) return [];
    const x = metric === 'tokens' ? group.mean_total_tokens_per_run : group.mean_api_equivalent_cost_usd_per_run;
    const total = metric === 'tokens' ? group.total_tokens : group.total_api_equivalent_cost_usd;
    if (!matchesMean(x,total,group.runs)) return [];
    const costReady = ['complete','verified','ready'].includes(status) || group.accounting_status?.cost === 'complete';
    if (metric === 'cost' && !costReady) return [];
    if (metric === 'cost' && group.cost_known_runs != null && group.cost_known_runs !== group.runs) return [];
    if (metric === 'cost' && (!/^\d{4}-\d{2}-\d{2}$/.test(group.pricing_as_of || '') || !pricingLinks(group.pricing_sources).length)) return [];
    const score = relativeScore(row.score,referenceScore(task));
    return score === null ? [] : [{participant:participants.get(row.participant_id), group, score, x}];
  });
  const dates = new Set(candidates.map(p => p.group.pricing_as_of));
  const mixedPricing = metric === 'cost' && dates.size > 1;
  const points = mixedPricing ? [] : candidates.sort((a,b) => b.score-a.score || a.x-b.x || a.participant.participant_id.localeCompare(b.participant.participant_id));
  return {points, frontier:paretoFrontier(points), eligible:eligible.length, omitted:eligible.length-points.length,
    mixedPricing, pricing_as_of:metric === 'cost' && dates.size === 1 ? [...dates][0] : null};
}
