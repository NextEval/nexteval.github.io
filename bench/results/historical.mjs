import { FEATURES, assetPath, featureFor, historyChartData, scoreText } from './model.mjs';
import { relativeScore, referenceScore } from './scores.mjs';
import { ScientificChart } from './chart.mjs';

const require = (condition, message) => { if (!condition) throw new Error(message); };
const unique = values => new Set(values).size === values.length;
const hash = value => /^[0-9a-f]{64}$/.test(value);

export function validateHistorical(data) {
  require(data?.schema === 'nexteval.historical-assisted/1' && data.status === 'historical-exploratory', 'Unrecognized historical archive');
  require(data.joint_with_current_bench === false && data.model_calls === 0 && data.objective_calls === 0, 'Historical comparison scope changed');
  require(data.score_definition === 'optiprofiler-normalized-mean-history-performance-1', 'Historical score definition changed');
  require(Array.isArray(data.cohorts) && unique(data.cohorts.map(c => c.id)), 'Duplicate historical cohort');
  for (const c of data.cohorts) {
    require(FEATURES.some(f => f.key === c.feature) && c.formal_bench_admission === false, 'Historical result relabeled as formal Bench');
    require(hash(c.source?.sha256) && c.source.repository === 'NextEval/nexteval-research', 'Unpinned research evidence');
    require(/^https:\/\/github\.com\/NextEval\/nexteval-research\//.test(c.source_url), 'Unsafe historical source URL');
    require(Number.isInteger(c.grid.problems) && c.grid.problems > 0 && Number.isInteger(c.grid.repetitions) && c.grid.repetitions > 0
      && c.grid.cells === c.grid.problems * c.grid.repetitions, 'Invalid historical denominator');
    require(unique(c.participants.map(p => p.id)), 'Duplicate historical participant');
    require(c.baseline_id === null ? !c.participants.some(p => p.source_name === 'COBYQA')
      : c.participants.some(p => p.id === c.baseline_id && p.source_name === 'COBYQA'), 'Historical baseline missing');
    require(c.participants.every(p => Number.isFinite(p.score) && p.score >= 0 && p.score <= 1 && p.recorded_cells === c.grid.cells
      && p.usage_tokens === null && p.actual_cost_usd === null), 'Unverified historical score or accounting');
    require(c.problems.length === c.grid.problems && unique(c.problems.map(p => p.name)), 'Incomplete historical problems');
    assetPath(c.profiles_file);
    c.problems.forEach(p => assetPath(p.history_file));
  }
  return data;
}

export function validateHistoricalHistory(history, cohort, problem) {
  require(history.schema === 'nexteval.historical-history/1' && history.cohort_id === cohort.id
    && history.problem === problem.name && history.source_sha256 === cohort.source.sha256, 'Historical history source mismatch');
  require(Number.isInteger(history.dimension) && history.dimension >= 1 && history.dimension <= 5 && history.budget === 50 * history.dimension, 'Historical budget changed');
  require(history.rows.length === cohort.participants.length * cohort.grid.repetitions
    && unique(history.rows.map(r => JSON.stringify([r.participant_id, r.repeat_index]))), 'Historical rows incomplete or duplicated');
  for (const r of history.rows) {
    require(cohort.participants.some(p => p.id === r.participant_id) && Number.isInteger(r.repeat_index)
      && r.repeat_index >= 0 && r.repeat_index < cohort.grid.repetitions, 'Unknown historical run');
    require(Number.isInteger(r.evaluations) && r.evaluations >= 0 && r.evaluations <= history.budget
      && r.values.length === r.evaluations, 'Historical history padded or truncated');
    require(r.values.every(v => typeof v === 'number' && Number.isFinite(v) || ['NaN', '+Inf', '-Inf'].includes(v)), 'Historical objective encoding invalid');
  }
  return history;
}

export function validateHistoricalProfile(profile, cohort) {
  require(profile.scope === cohort.id && profile.problems === cohort.grid.problems && profile.repeats === cohort.grid.repetitions
    && profile.new_evaluations === 0 && profile.indices.length === cohort.participants.length, 'Historical profile population changed');
  require(profile.scores.length === cohort.participants.length && profile.scores.every((s, i) => s === cohort.participants[i].score), 'Historical score changed');
  for (const kind of ['performance', 'data']) {
    const curves = profile.profiles[kind];
    require(curves.series.length === cohort.participants.length && curves.interpolation === 'step-after', 'Historical profile members changed');
    curves.series.forEach((s, i) => {
      require(s.label === cohort.participants[i].label && s.x.length === s.y.length && s.x.length > 0
        && s.x.every((x, j) => Number.isFinite(x) && (!j || x >= s.x[j - 1]))
        && s.y.every(y => Number.isFinite(y) && y >= 0 && y <= 1), 'Invalid historical profile coordinates');
    });
  }
  return profile;
}

export async function renderHistorical({host, snapshot, params, readJSON, fileURL, esc, views, footer, isCurrent}) {
  const data = validateHistorical(await readJSON(fileURL('historical-assisted/index.json')));
  if (!isCurrent()) return null;
  const selected = data.cohorts.find(c => c.id === params.get('cohort'));
  const feature = FEATURES.find(f => f.key === (params.get('feature') || selected?.feature)) || FEATURES[0];
  const cohorts = data.cohorts.filter(c => c.feature === feature.key);
  const cohort = cohorts.find(c => c.id === selected?.id) || cohorts[0];
  const task = snapshot.tasks.find(t => featureFor(t)?.key === feature.key);
  const view = ['performance', 'data', 'history'].includes(params.get('view')) ? params.get('view') : 'performance';
  const path = values => '#historical?' + new URLSearchParams({feature:feature.key, cohort:cohort?.id || '', view, ...values});
  const rows = cohorts.flatMap(c => {
    const baseline = c.participants.find(p => p.id === c.baseline_id)?.score;
    return c.participants.filter(p => p.kind === 'agent').map(p => ({c, p, relative:relativeScore(p.score, baseline)}));
  });
  host.innerHTML = `<div class="results-heading"><div><h1>NextEval-assisted systems</h1><p>Historical research / exploratory comparison / SYU retest not started</p></div></div>
    ${views('historical',task)}
    <p class="historical-warning">Separate cohorts, not one leaderboard. Historical starts, seeds, time limits, machines and repeat counts differ from current Bench. Scores use the full recorded comparison and its own COBYQA where available; Qwen has no COBYQA anchor.</p>
    <div class="results-toolbar"><span class="results-scope">S2MPJ / dimensions &le; 5 / 50 &times; n evaluations</span><label class="results-sort" for="historical-feature">Task<select id="historical-feature">${FEATURES.map(f => `<option value="${f.key}" ${feature === f ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label></div>
    <section class="historical-section"><h2>Historical assisted systems</h2>
    ${rows.length ? `<div class="results-table-scroll"><table class="coverage-table historical-table"><thead><tr><th>System</th><th>Own-cohort score</th><th>Cases / configuration</th><th>Historical host</th></tr></thead><tbody>${rows.map(({c,p,relative}) => `<tr><td><a href="${path({cohort:c.id})}">${esc(p.label)}</a><small>${esc(c.harness)} / ${esc(c.id)}</small></td><td>${relative === null ? 'No COBYQA anchor' : scoreText(relative)}<small>Original ${p.score.toFixed(6)}</small></td><td>${c.grid.problems} &times; ${c.grid.repetitions} = ${c.grid.cells}</td><td>${esc(c.machine)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="profile-note">No complete assisted archive found for this condition in the reviewed research records. No score is inferred.</p>'}
    </section>
    <details class="results-method historical-current"><summary>Current Bench / ${esc(feature.label)} / separate comparison</summary><p>Current packaged protocol: 92 problems &times; 10 repeats, perturbation 0.03, 1000-second wall limit. Historical scores above are not members of this comparison.</p>
    <div class="results-table-scroll"><table class="coverage-table"><thead><tr><th>Current configuration</th><th>Current score</th></tr></thead><tbody>${(task?.scores || []).map(row => ({...row, participant:snapshot.participants.find(p => p.participant_id === row.participant_id)})).sort((a,b) => b.score-a.score).map(row => `<tr><td>${esc(row.participant.label)}</td><td>${scoreText(relativeScore(row.score,referenceScore(task)))}</td></tr>`).join('')}</tbody></table></div><p><a href="#task/${encodeURIComponent(task?.task_id || '')}">Current task profiles</a></p></details>
    ${cohort ? `<section class="historical-section"><div class="results-toolbar"><h2>Archived profiles and histories</h2><label class="results-sort" for="historical-cohort">Cohort<select id="historical-cohort">${cohorts.map(c => `<option value="${c.id}" ${c === cohort ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label></div>
    <p class="profile-note">${esc(cohort.caveat)}</p><p class="profile-note">Start perturbation: ${cohort.perturbation_level ?? 'not independently pinned'} / wall limit: ${cohort.timeout_s == null ? 'not independently pinned' : cohort.timeout_s + ' s'} / actual cost: unknown. Abnormal and early-ended histories remain included.</p>
    <nav class="results-tabs" aria-label="Historical evidence views">${[['performance','Performance'],['data','Data'],['history','Histories']].map(([key,label]) => `<a href="${path({view:key})}" ${view === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div id="historical-controls"></div><div id="historical-chart" class="profile-chart"></div>
    <div class="results-table-scroll"><table class="coverage-table"><thead><tr><th>Full comparison member</th><th>Original score</th><th>Recorded cells</th><th>Abnormal / fallback</th></tr></thead><tbody>${cohort.participants.map(p => `<tr><td>${esc(p.label)}</td><td>${p.score.toFixed(6)}</td><td>${p.recorded_cells}</td><td>${p.abnormal_cells} / ${p.fallback_cells}</td></tr>`).join('')}</tbody></table></div>
    <details class="results-method"><summary>Source and comparison protocol</summary><p>OptiProfiler mean normalized history-performance area over ten tolerances. Full archived participant set, fixed before inspection. Display = p<sup>4</sup> / (p<sup>4</sup> + b<sup>4</sup>); own-cohort COBYQA = 0.50. Profiles below show tolerance 10<sup>-6</sup>. Neither scale is an effect size or a cross-cohort ranking.</p><p>Harness ${esc(cohort.harness)} / model revision ${esc(cohort.model_actual || 'see archived configuration')} / solver revision ${esc(cohort.solver_commit || 'not independently pinned here')}</p><p>HDF5 SHA-256 <code>${esc(cohort.source.sha256)}</code></p><p><a href="${esc(cohort.source_url)}" target="_blank" rel="noopener noreferrer">Private research source</a> / <a href="${fileURL(cohort.profiles_file)}" download>Numerical profiles JSON</a> / <a href="${fileURL('historical-assisted/index.json')}" download>Historical source index</a></p></details></section>` : ''}
    ${footer()}`;
  document.getElementById('historical-feature').onchange = event => { location.hash = '#historical?' + new URLSearchParams({feature:event.target.value}); };
  if (!cohort) return null;
  document.getElementById('historical-cohort').onchange = event => { location.hash = path({cohort:event.target.value}); };
  let chartData;
  if (view === 'history') {
    const problem = cohort.problems.find(p => p.name === params.get('problem')) || cohort.problems[0];
    const requested = Number(params.get('repeat') || 0);
    const repeat = Number.isInteger(requested) && requested >= 0 && requested < cohort.grid.repetitions ? requested : 0;
    const history = validateHistoricalHistory(await readJSON(fileURL(problem.history_file)),cohort,problem);
    if (!isCurrent()) return null;
    document.getElementById('historical-controls').innerHTML = `<div class="results-toolbar"><label class="results-sort" for="historical-problem">Problem<select id="historical-problem">${cohort.problems.map(p => `<option ${p === problem ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label class="results-sort" for="historical-repeat">Repeat<select id="historical-repeat">${Array.from({length:cohort.grid.repetitions},(_,i) => `<option value="${i}" ${i === repeat ? 'selected' : ''}>${i+1}</option>`).join('')}</select></label><a href="${fileURL(problem.history_file)}" download>History JSON</a></div>`;
    const update = () => { location.hash = path({problem:document.getElementById('historical-problem').value, repeat:document.getElementById('historical-repeat').value}); };
    document.getElementById('historical-problem').onchange = update;
    document.getElementById('historical-repeat').onchange = update;
    chartData = historyChartData(history,cohort.participants.map(p => ({...p,participant_id:p.id})),repeat);
  } else {
    const profile = validateHistoricalProfile(await readJSON(fileURL(cohort.profiles_file)),cohort);
    if (!isCurrent()) return null;
    chartData = {...profile.profiles[view], tolerance:profile.tolerance, unit:`Fraction of ${cohort.grid.cells} archived cases reaching target`};
  }
  const chart = new ScientificChart(document.getElementById('historical-chart'));
  chart.set(chartData,view);
  return chart;
}
