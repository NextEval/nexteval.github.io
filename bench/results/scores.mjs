export const DISPLAY_SCORE_DEFINITION = Object.freeze({
  id: 'cobyqa-relative-performance/2',
  formula: 'p^4 / (p^4 + b^4)',
  exponent: 4,
  purpose: 'Fixed display contrast transform; not an effect size or a new experimental result',
  input: 'Task-level mean normalized history performance score from OptiProfiler',
  reference_participant_id: 'cobyqa',
  reference_value: 0.5,
  range: [0, 1],
  unavailable: 'Null if p is missing or b is missing, nonfinite, or zero',
  interpretation: 'Above 0.5 means a higher aggregate score than COBYQA, not a win probability or statistical significance',
  comparison: 'Scores remain dependent on the frozen task comparison membership and targets',
});

export const HEAT_COLORS = Object.freeze([
  '#18181b', '#1c1d23', '#20222c', '#242834', '#273342', '#2a4152',
  '#2c4f62', '#29606f', '#1b707d', '#0e808b', '#008e98',
]);

const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export function relativeScore(score, baseline) {
  if (!valid(score) || !valid(baseline) || baseline <= 0) return null;
  // Take a bounded ratio first to avoid underflow of both powers.
  if (score >= baseline) return 1 / (1 + (baseline / score) ** DISPLAY_SCORE_DEFINITION.exponent);
  const ratio = (score / baseline) ** DISPLAY_SCORE_DEFINITION.exponent;
  return ratio / (1 + ratio);
}

export function referenceScore(task) {
  return task?.scores.find(row => row.participant_id === DISPLAY_SCORE_DEFINITION.reference_participant_id)?.score ?? null;
}

export function heatColor(score) {
  if (!valid(score)) return null;
  const position = score * (HEAT_COLORS.length - 1);
  const lower = Math.min(Math.floor(position), HEAT_COLORS.length - 2);
  const fraction = position - lower;
  const rgb = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  const a = rgb(HEAT_COLORS[lower]), b = rgb(HEAT_COLORS[lower + 1]);
  return 'rgb(' + a.map((channel, i) => (channel + fraction * (b[i] - channel)).toFixed(6)).join(' ') + ')';
}

export function relativeScoreExport(snapshot) {
  const tasks = new Map(snapshot.tasks.map(task => [task.task_id, task]));
  return {
    schema: 'nexteval.display-scores/1',
    source_snapshot_id: snapshot.snapshot_id,
    source_score_definition: snapshot.score_definition,
    display_score_definition: DISPLAY_SCORE_DEFINITION,
    rows: snapshot.matrix.map(cell => {
      const baseline = referenceScore(tasks.get(cell.task_id));
      return {
        task_id: cell.task_id,
        comparison_id: cell.comparison_id,
        participant_id: cell.participant_id,
        original_score: cell.score,
        reference_score: baseline,
        display_score: relativeScore(cell.score, baseline),
      };
    }),
  };
}
