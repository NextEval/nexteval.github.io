export const FEATURES = [
  { key: 'perturbed', label: 'Perturbed starts', icon: 'move-up-right', description: 'A different starting point' },
  { key: 'noisy', label: 'Noisy observations', icon: 'audio-lines', description: 'Function values with noise' },
  { key: 'rotated', label: 'Rotated coordinates', icon: 'rotate-3d', description: 'A different coordinate system' },
  { key: 'random_nan', label: 'Random NaN', icon: 'circle-off', description: 'Some evaluations return no value' },
];

const require = (condition, message) => { if (!condition) throw new Error(message); };
const unique = values => new Set(values).size === values.length;
export const finiteScore = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export const scoreText = value => finiteScore(value) ? value.toFixed(2) : '';
export const heatLevel = value => finiteScore(value) ? Math.min(10, Math.floor(value * 10)) : null;
export const cellKey = (participant, task) => JSON.stringify([participant, task]);

export function assetPath(value) {
  require(typeof value === 'string' && /^[a-zA-Z0-9_./-]+\.json$/.test(value)
    && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe result asset path');
  return value;
}

export function featureFor(task) {
  return FEATURES.find(feature => task.task_id.includes(`-${feature.key}@`)) || null;
}

export function validateSnapshot(data) {
  require(data?.schema === 'nexteval.web-results/1', 'Unsupported result schema');
  require(!data.fixture_only && data.status !== 'pending' && typeof data.snapshot_id === 'string' && data.snapshot_id.length > 0, 'No released result snapshot');
  require(data.score_definition?.id === 'optiprofiler-normalized-mean-history-performance-1', 'Unsupported score definition');
  require(data.axes?.performance?.axis_transform === 'log2' && data.axes?.data?.axis_transform === 'log2_1p'
    && data.axes.performance.coordinates_transformed === true && data.axes.data.coordinates_transformed === true, 'Unrecognized profile axis encoding');
  require(Array.isArray(data.participants) && Array.isArray(data.tasks) && Array.isArray(data.matrix), 'Incomplete result snapshot');
  require(unique(data.participants.map(p => p.participant_id)) && unique(data.tasks.map(t => t.task_id)), 'Duplicate result identity');
  require(data.participants.every(p => typeof p.participant_id === 'string' && typeof p.label === 'string'), 'Invalid participant');
  const participants = new Set(data.participants.map(p => p.participant_id));
  const tasks = new Map(data.tasks.map(task => [task.task_id, task]));
  for (const task of data.tasks) {
    require(/^nexteval-u5-(perturbed|perturbed-noisy|perturbed-rotated|random_nan|perturbed-random_nan)@\d+$/.test(task.task_id), 'Task outside this U5 release');
    require(task.parameters?.max_eval_factor === 50, 'Evaluation budget differs from displayed scope');
    require(typeof task.label === 'string' && Array.isArray(task.scores) && Array.isArray(task.members), 'Invalid task');
    require(!task.snapshot_id || task.snapshot_id === data.snapshot_id, 'Mixed task snapshots');
    require(unique(task.members) && task.members.every(id => participants.has(id)), 'Invalid comparison members');
    require(unique(task.scores.map(s => s.participant_id)), 'Duplicate task score');
    require(!task.scores.length || (typeof task.comparison_id === 'string' && task.comparison_id.length > 0), 'Score without frozen comparison');
    require(task.scores.every(s => task.members.includes(s.participant_id) && finiteScore(s.score)), 'Invalid score or comparison member');
    require(!task.scores.length || task.scores.length === task.members.length, 'Incomplete scored comparison');
    for (const key of ['profiles_file', 'history_file']) if (task[key]) assetPath(task[key]);
    for (const row of task.coverage || []) {
      require(participants.has(row.participant_id), 'Unknown coverage participant');
      require(['expected', 'terminal', 'normal', 'timeout', 'missing'].every(k => Number.isInteger(row[k]) && row[k] >= 0), 'Invalid coverage counts');
      require(row.normal + row.timeout === row.terminal && row.terminal + row.missing === row.expected, 'Inconsistent coverage denominator');
    }
  }
  require(unique(data.matrix.map(cell => cellKey(cell.participant_id, cell.task_id))), 'Duplicate matrix cell');
  for (const cell of data.matrix) {
    const task = tasks.get(cell.task_id);
    require(task && participants.has(cell.participant_id), 'Unknown matrix identity');
    const source = task.scores.find(s => s.participant_id === cell.participant_id);
    if (cell.score === null) require(!source, 'Missing matrix score contradicts task');
    else require(finiteScore(cell.score) && source?.score === cell.score && cell.comparison_id === task.comparison_id, 'Matrix score differs from frozen task');
  }
  for (const task of data.tasks) for (const score of task.scores) {
    require(data.matrix.some(cell => cell.task_id === task.task_id && cell.participant_id === score.participant_id && cell.score === score.score), 'Task score omitted from matrix');
  }
  return data;
}

export function sortedParticipants(data, taskId) {
  const task = data.tasks.find(task => task.task_id === taskId);
  const scores = new Map((task?.scores || []).map(row => [row.participant_id, row.score]));
  return data.participants.filter(p => data.matrix.some(c => c.participant_id === p.participant_id && finiteScore(c.score)))
    .slice().sort((a, b) => (scores.get(b.participant_id) ?? -1) - (scores.get(a.participant_id) ?? -1)
      || a.label.localeCompare(b.label));
}

export function validateProfiles(profiles, task) {
  require(profiles.task_id === task.task_id && profiles.comparison_id === task.comparison_id, 'Profile comparison does not match task');
  require(profiles.axes?.performance?.axis_transform === 'log2' && profiles.axes?.data?.axis_transform === 'log2_1p'
    && profiles.axes.performance.coordinates_transformed && profiles.axes.data.coordinates_transformed, 'Profile axis encoding changed');
  require(Array.isArray(profiles.tolerances) && profiles.tolerances.length > 0, 'Missing profile tolerances');
  for (const level of profiles.tolerances) {
    require(Number.isFinite(level.tolerance) && level.tolerance > 0 && level.tolerance < 1, 'Invalid tolerance');
    require(unique(level.series.map(s => s.participant_id)) && level.series.length === task.members.length, 'Incomplete profile comparison');
    for (const series of level.series) {
      require(task.members.includes(series.participant_id), 'Unexpected profile participant');
      for (const kind of ['performance', 'data']) {
        const { x, y } = series[kind];
        require(Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.length > 0, 'Invalid profile coordinates');
        require(x.every((v, i) => Number.isFinite(v) && (i === 0 || v >= x[i - 1])) && y.every(finiteScore), 'Nonfinite or unsorted profile');
      }
    }
  }
  return profiles;
}

export function chartData(profiles, task, participants, kind, tolerance) {
  const level = profiles.tolerances.find(item => item.tolerance === tolerance);
  require(level, 'Tolerance is absent from this comparison');
  const series = level.series.map(row => ({ label: participants.find(p => p.participant_id === row.participant_id).label, ...row[kind] }));
  const xs = series.flatMap(s => s.x);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const gap = Math.max(1, Math.ceil((xmax - xmin) / 6));
  const ticks = [];
  for (let x = Math.ceil(xmin); x <= xmax; x += gap) ticks.push(x);
  return { series, x_domain: [xmin, xmax], x_ticks: ticks, tolerance,
    unit: `Fraction of ${task.grid?.cells ?? 'all'} problem-repetition cases reaching target` };
}

export function validateHistoryIndex(index, task) {
  require(index.task_id === task.task_id && index.comparison_id === task.comparison_id, 'History comparison does not match task');
  require(Array.isArray(index.problems) && index.problems.length === task.grid.problems && unique(index.problems.map(p => p.problem)), 'Incomplete history problem index');
  for (const problem of index.problems) assetPath(problem.history_file);
  return index;
}

export function validateHistory(history, task, problem) {
  require(history.task_id === task.task_id && history.comparison_id === task.comparison_id && history.problem === problem.problem && history.dimension === problem.dimension, 'History identity does not match selection');
  require(Array.isArray(history.rows) && history.rows.length === task.members.length * task.grid.repetitions, 'Incomplete history comparison');
  require(unique(history.rows.map(row => cellKey(row.participant_id, row.repeat_index))), 'Duplicate history cell');
  for (const row of history.rows) {
    require(task.members.includes(row.participant_id) && Number.isInteger(row.repeat_index) && row.repeat_index >= 0 && row.repeat_index < task.grid.repetitions, 'Unknown history cell');
    require(Number.isInteger(row.evaluations) && row.evaluations >= 0 && row.evaluations <= history.budget && row.values.length === row.evaluations, 'History length exceeds recorded evaluations');
    require(row.values.every(v => typeof v === 'number' && Number.isFinite(v) || ['NaN','+Inf','-Inf'].includes(v)), 'Invalid objective encoding');
  }
  return history;
}

export function historyChartData(history, participants, repeat) {
  const series = history.rows.filter(row => row.repeat_index === repeat).map(row => {
    let best = Infinity;
    const y = row.values.map(value => {
      if (value === '-Inf') best = -Infinity;
      else if (typeof value === 'number') best = Math.min(best, value);
      return Number.isFinite(best) ? best : null;
    });
    return { label:participants.find(p => p.participant_id === row.participant_id).label,
      x:row.values.map((_,i) => i + 1), y, n_evals:row.evaluations };
  });
  const values = series.flatMap(s => s.y.filter(Number.isFinite));
  return { series, x_domain:[1,history.budget], y_domain:values.length ? [Math.min(...values),Math.max(...values)] : [0,1],
    positive:values.length > 0 && values.every(v => v > 0), metric:'Best observed clean objective', repeat };
}
