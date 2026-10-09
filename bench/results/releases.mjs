import { relativeScore, referenceScore } from './scores.mjs';
import { paretoFrontier, pricingLinks } from './usage.mjs';
import { participantFamily } from './plan.mjs';

export function releaseTimestamp(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(value) && new Date(value).toISOString().slice(0,10) === date ? value : null;
}

export function validateReleases(data) {
  if (data?.schema !== 'nexteval.model-releases/1' || !Array.isArray(data.models)
    || releaseTimestamp(data.checked_at) === null || data.date_policy !== 'first_public_release') throw new Error('Unsupported model release snapshot');
  const seen = new Set();
  for (const row of data.models) {
    if (!row.model || seen.has(row.model)) throw new Error('Missing or duplicate model release identity');
    seen.add(row.model);
    if (releaseTimestamp(row.released_at) === null || row.released_at > data.checked_at
      || !pricingLinks(row.sources).length) throw new Error('Unverified model release date');
  }
  if (data.excluded_models != null && !Array.isArray(data.excluded_models)) throw new Error('Invalid release exclusions');
  for (const row of data.excluded_models || []) {
    if (!row.model || seen.has(row.model) || typeof row.reason !== 'string' || !row.reason.trim()
      || row.released_at != null || !pricingLinks(row.sources).length) throw new Error('Invalid release exclusion');
    seen.add(row.model);
  }
  return data;
}

export function releaseData(snapshot, releases, task, family = '', usage = null) {
  const participants = new Map(snapshot.participants.map(p=>[p.participant_id,p]));
  const dates = new Map(releases.models.map(r=>[r.model,r]));
  const groups = new Map((usage?.groups || []).filter(g=>g.task_id===task.task_id).map(g=>[g.participant_id,g]));
  const eligible = task.scores.filter(row=>{
    const p = participants.get(row.participant_id);
    return p && !['scipy','reference'].includes(p.harness) && (!family || participantFamily(p)===family);
  });
  // Dates belong to the exact requested model, never to a nearby family or a run timestamp.
  const points = eligible.flatMap(row=>{
    const participant = participants.get(row.participant_id), release = dates.get(participant.model);
    const score = relativeScore(row.score,referenceScore(task));
    const x = releaseTimestamp(release?.released_at);
    return x === null || score === null ? [] : [{participant,release,score,x,group:groups.get(row.participant_id) || null}];
  }).sort((a,b)=>b.score-a.score || a.x-b.x || a.participant.participant_id.localeCompare(b.participant.participant_id));
  return {points,frontier:paretoFrontier(points),eligible:eligible.length,omitted:eligible.length-points.length,checked_at:releases.checked_at};
}
