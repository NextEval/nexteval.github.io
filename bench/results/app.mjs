import { FEATURES, validateSnapshot, validateProfiles, validateHistoryIndex, validateHistory, historyChartData, sortedParticipants, scoreText, heatLevel, featureFor, assetPath, chartData } from './model.mjs';
import { ScientificChart, formatNumber } from './chart.mjs';

const host = document.getElementById('results-app');
document.querySelector('.results-skip')?.addEventListener('click', event => {
  event.preventDefault(); host.focus(); host.scrollIntoView({block:'start'});
});
const dataURL = new URL('./data/results.json', import.meta.url);
const archiveURL = host.dataset.archive || '../index.html#profiles';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const taskURL = (task, values = {}) => '#task/' + encodeURIComponent(task.task_id) + '?' + new URLSearchParams(values);
const cache = new Map();
let snapshot, chart, previousPath, epoch = 0;

async function readJSON(url) {
  if (!cache.has(url.href)) cache.set(url.href, fetch(url).then(response => {
    if (!response.ok) throw new Error(`Result file unavailable (HTTP ${response.status})`);
    return response.json();
  }).catch(error => { cache.delete(url.href); throw error; }));
  return cache.get(url.href);
}

const fileURL = file => new URL(assetPath(file), dataURL);
const labelFor = p => {
  if (!p.model || p.harness === 'reference' || p.model === 'none') return p.label;
  const model = p.model.split('/').at(-1);
  return ({ 'gpt-5.5':'GPT-5.5', 'gpt-5.6-sol':'GPT-5.6 Sol', 'gpt-5.6-terra':'GPT-5.6 Terra', 'gpt-5.6-luna':'GPT-5.6 Luna', 'gpt-6-sol':'GPT-6 Sol', 'gpt-6-luna':'GPT-6 Luna', 'claude-sonnet-5':'Claude Sonnet 5', 'deepseek-v4-flash':'DeepSeek V4 Flash' }[model] || p.model);
};
const detailFor = p => [({'codex':'Codex','claude-code':'Claude Code','scipy':'SciPy'}[p.harness] || p.harness), p.effort].filter(v => v && v !== 'none').join(' / ');
const chartParticipants = () => snapshot.participants.map(p => ({...p,label:reference(p) ? p.label : `${labelFor(p)} / ${detailFor(p)}`}));
const reference = p => /cobyqa/i.test(p.label);
const dateLabel = () => snapshot.generated_at ? new Date(snapshot.generated_at).toISOString().slice(0,10) : 'Versioned snapshot';

function footer() {
  return `<footer class="results-footer"><span>NextEval Bench / ${esc(dateLabel())}</span><div class="results-links"><a href="${esc(dataURL.href)}" download>Snapshot JSON</a><a href="https://github.com/NextEval/nexteval-bench-data" title="Private data archive; repository access required">Data archive</a></div></footer>`;
}

function method(task) {
  return `<details class="results-method"><summary>Score and comparison protocol</summary>
    <p>Scores are normalized performance-profile areas exported by OptiProfiler, averaged over 10 tolerances from 10<sup>-1</sup> to 10<sup>-10</sup>. Higher is better. A score of 1 is not a 100% success rate. Each task has its own fixed comparison; there is no cross-task average.</p>
    <p>Each target uses the best budgeted history among that task's comparison members, including the matched COBYQA reference, for the same problem and repetition. Adding a member requires a new complete comparison.</p>
    <p>Historical normal 300-second runs and terminal 1000-second runs are included under the current reporting policy. Actual limits remain recorded below. This is not a controlled identical-prompt/time-limit experiment. Timeouts stay in the denominator.</p>
    ${task ? `<p>Comparison <code>${esc(task.comparison_id)}</code><br>Task <code>${esc(task.task_id)}</code> / version ${esc(task.task_version)}<br>Cohort <code>${esc(task.cohort)}</code></p>` : ''}
    <p>Snapshot <code>${esc(snapshot.snapshot_id)}</code><br>Registry commit <code>${esc(snapshot.registry_commit)}</code></p>
    ${task?.limitations?.length ? `<ul>${task.limitations.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}
  </details>`;
}

function matrix(params) {
  const tasks = FEATURES.map(feature => snapshot.tasks.find(t => featureFor(t)?.key === feature.key));
  const sortable = tasks.filter(t => t?.scores.length);
  const selected = sortable.find(t => t.task_id === params.get('sort')) || sortable[0];
  const rows = sortedParticipants(snapshot, selected?.task_id);
  const cells = new Map(snapshot.matrix.map(c => [JSON.stringify([c.participant_id,c.task_id]), c]));
  host.innerHTML = `<div class="results-heading"><div><h1>Task matrix</h1><p>NextEval Bench / agent performance across packaged optimization tests</p></div><span class="results-edition">${esc(dateLabel())}</span></div>
    <div class="results-toolbar"><div class="results-scope"><span>S2MPJ</span><span>Unconstrained</span><span>Dimensions &le; 5</span><span>50 &times; n evaluations</span></div>
      <label class="results-sort" for="sort-task">Sort by<select id="sort-task" ${selected ? '' : 'disabled'}>${sortable.map(t => `<option value="${esc(t.task_id)}" ${t === selected ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label></div>
    <div class="matrix-meta"><span>${rows.length} configurations / ${sortable.length} published comparisons</span><div class="heat-legend"><span>Score</span><span>0</span><span class="heat-scale" aria-hidden="true">${Array.from({length:11},(_,i) => `<i class="heat-${i}"></i>`).join('')}</span><span>1</span></div></div>
    <div class="results-table-scroll" role="region" aria-label="Agent scores by task" tabindex="0"><table class="results-matrix"><caption>Exported scores sorted by ${esc(selected?.label || 'task')}. Empty cells have no published score.</caption><colgroup><col><col><col><col><col></colgroup><thead><tr><th scope="col">Agent / configuration</th>${FEATURES.map((feature,i) => {
      const task = tasks[i];
      return `<th scope="col"><button class="task-column ${task === selected ? 'selected' : ''}" ${task ? `data-task="${esc(task.task_id)}"` : 'disabled'} title="${esc(feature.description)}">${icon(feature.icon)}<span>${esc(task?.label || feature.label)}</span><small>${task?.scores.length ? `${task.grid.problems} problems / ${task.grid.repetitions} repeats` : 'Not published'}</small></button></th>`;
    }).join('')}</tr></thead><tbody>${rows.map(p => `<tr class="${reference(p) ? 'reference' : ''}"><th scope="row"><span class="participant-name">${esc(labelFor(p))}</span><span class="participant-detail">${esc(reference(p) ? 'Numerical reference' : detailFor(p))}</span></th>${tasks.map(t => {
      const c = t && cells.get(JSON.stringify([p.participant_id,t.task_id]));
      return c?.score != null ? `<td class="heat-${heatLevel(c.score)}"><a href="${taskURL(t)}" aria-label="${esc(p.label)}, ${esc(t.label)}, score ${scoreText(c.score)}">${scoreText(c.score)}</a></td>` : '<td aria-label="No published result" title="No published result"></td>';
    }).join('')}</tr>`).join('')}</tbody></table></div>
    ${rows.length ? '' : '<section class="results-empty"><h2>No scored comparison released</h2><p>Completed coverage alone is not a score. Results will appear after the offline comparison export is verified.</p></section>'}
    <div class="matrix-foot"><span>Higher is better / empty = not published</span><span>Order: ${esc(selected?.label || 'none')} / descending</span></div>
    ${method()}${footer()}`;
  document.getElementById('sort-task').onchange = event => { location.hash = 'matrix?' + new URLSearchParams({ sort:event.target.value }); };
  host.querySelectorAll('[data-task]').forEach(button => button.onclick = () => { location.hash = taskURL(snapshot.tasks.find(t => t.task_id === button.dataset.task)); });
}

function coverage(task) {
  return `<section class="task-coverage"><h2>Coverage and execution limits</h2><div class="results-table-scroll"><table class="coverage-table"><thead><tr><th>Configuration</th><th>Terminal / expected</th><th>Normal</th><th>Timeout</th><th>Actual limits</th></tr></thead><tbody>${(task.coverage || []).map(row => {
    const participant = snapshot.participants.find(p => p.participant_id === row.participant_id);
    return `<tr><td>${esc(participant.label)}</td><td>${row.terminal} / ${row.expected}</td><td>${row.normal}</td><td>${row.timeout}</td><td>${Object.entries(row.actual_timeout_counts || {}).map(([limit,count]) => `${esc(limit)} s: ${count}`).join(' / ') || 'Not specified'}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
}

function evidence(task) {
  return `<details class="results-method"><summary>Source evidence</summary><p>Numerical exports are public display files. Archive identifiers below refer to private evidence; they are not public download links.</p>
    <ul>${(task.evidence_refs || []).map(ref => `<li>${esc(ref.visibility || 'private')} / <code>${esc(ref.archive_id || ref.submission_id || ref.id)}</code>${ref.bundle_sha256 ? `<br>SHA-256 <code>${esc(ref.bundle_sha256)}</code>` : ''}</li>`).join('')}</ul>
    <p>${task.profiles_file ? `<a href="${fileURL(task.profiles_file)}" download>Profile coordinates</a>` : ''}${task.history_file ? ` / <a href="${fileURL(task.history_file)}" download>Numerical histories</a>` : ''}</p></details>`;
}

async function detail(task, params, ticket) {
  const feature = featureFor(task);
  const view = ['performance','data','history'].includes(params.get('view')) ? params.get('view') : 'performance';
  host.innerHTML = `<a class="back-link" href="#matrix">${icon('arrow-left')}Task matrix</a><div class="results-heading"><div class="task-identity">${icon(feature?.icon || 'layers')}<div><h1>${esc(task.label)}</h1><p>S2MPJ / unconstrained / dimensions &le; 5</p></div></div><span class="results-edition">${esc(dateLabel())}</span></div>
    <div class="task-facts"><div><strong>${task.grid?.problems ?? ''}</strong><span>problems</span></div><div><strong>${task.grid?.repetitions ?? ''}</strong><span>repeats</span></div><div><strong>${task.grid?.cells ?? ''}</strong><span>cases per configuration</span></div><div><strong>${task.members.length}</strong><span>comparison members</span></div></div>
    <div class="profile-toolbar"><nav class="results-tabs" aria-label="Task views">${[['performance','Performance'],['data','Data'],['history','Histories']].map(([key,label]) => `<a href="${taskURL(task,{view:key})}" ${view === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div id="profile-options"></div></div>
    <section id="task-view" aria-live="polite"><p>Loading numerical evidence</p></section>${coverage(task)}${method(task)}${evidence(task)}${footer()}`;
  window.lucide?.createIcons();
  const viewHost = document.getElementById('task-view');
  if (view === 'history') {
    if (!task.history_file) { viewHost.innerHTML = '<section class="results-empty"><h2>Histories not published</h2><p>No numerical history export is available for this comparison.</p></section>'; return; }
    const histories = await readJSON(fileURL(task.history_file));
    if (ticket !== epoch) return;
    await renderHistories(histories, task, params, viewHost, ticket);
    return;
  }
  if (!task.profiles_file) { viewHost.innerHTML = '<section class="results-empty"><h2>Comparison not published</h2><p>This task has no verified profile export yet.</p></section>'; return; }
  const profiles = validateProfiles(await readJSON(fileURL(task.profiles_file)), task);
  if (ticket !== epoch) return;
  const requested = Number(params.get('tolerance') || 1e-6);
  const tolerance = profiles.tolerances.some(p => p.tolerance === requested) ? requested : profiles.tolerances[0].tolerance;
  document.getElementById('profile-options').innerHTML = `<label class="results-sort" for="tolerance">Target tolerance<select id="tolerance">${profiles.tolerances.map(p => `<option value="${p.tolerance}" ${p.tolerance === tolerance ? 'selected' : ''}>${p.tolerance.toExponential(0)}</option>`).join('')}</select></label>`;
  document.getElementById('tolerance').onchange = event => { location.hash = taskURL(task,{view,tolerance:event.target.value}); };
  viewHost.innerHTML = `<div class="profile-intro"><h2>${view === 'performance' ? 'How efficiently is the target reached?' : 'How much evaluation budget is needed?'}</h2><p>${view === 'performance' ? 'Evaluation count relative to the fastest successful member, across the full test package' : 'Cases reaching the target as the evaluation budget grows, normalized by dimension + 1'}</p></div><div id="profile-chart" class="profile-chart"></div><p class="profile-note">Fixed comparison and denominator / curves are exact exported steps / hiding a curve does not change scores</p>`;
  chart = new ScientificChart(document.getElementById('profile-chart'));
  chart.set(chartData(profiles,task,chartParticipants(),view,tolerance),view);
}

// The history adapter is kept separate from the score/profile contract.
async function renderHistories(histories, task, params, viewHost, ticket) {
  const index = validateHistoryIndex(histories,task);
  const problem = index.problems.find(p => p.problem === params.get('problem')) || index.problems[0];
  const requested = Number(params.get('repeat') || 0);
  const repeat = Number.isInteger(requested) && requested >= 0 && requested < task.grid.repetitions ? requested : 0;
  viewHost.innerHTML = `<div class="profile-intro"><h2>Evaluations within a problem</h2><p>Clean numerical observations, not agent logs or a claimed final answer</p></div><div class="history-controls"><label for="history-problem">Problem<select id="history-problem">${index.problems.map(p => `<option value="${esc(p.problem)}" ${p === problem ? 'selected' : ''}>${esc(p.problem)} / n = ${p.dimension}</option>`).join('')}</select></label><label for="history-repeat">Repeat<select id="history-repeat">${Array.from({length:task.grid.repetitions},(_,i) => `<option value="${i}" ${i === repeat ? 'selected' : ''}>${i+1}</option>`).join('')}</select></label></div><div id="history-chart" class="profile-chart"></div><div id="history-receipt"></div>`;
  const update = () => { location.hash = taskURL(task,{view:'history',problem:document.getElementById('history-problem').value,repeat:document.getElementById('history-repeat').value}); };
  document.getElementById('history-problem').onchange = update;
  document.getElementById('history-repeat').onchange = update;
  const history = validateHistory(await readJSON(fileURL(problem.history_file)),task,problem);
  if (ticket !== epoch) return;
  chart = new ScientificChart(document.getElementById('history-chart'));
  chart.set(historyChartData(history,chartParticipants(),repeat),'history');
  const rows = history.rows.filter(row => row.repeat_index === repeat);
  document.getElementById('history-receipt').innerHTML = `<p class="profile-note">Best observed clean value after each recorded evaluation / lower is better / curves end where runs end. Nonfinite observations remain counted. This is not the agent-returned solution.</p><div class="results-table-scroll"><table class="coverage-table"><thead><tr><th>Configuration</th><th>Evaluations</th><th>Best finite value</th><th>Nonfinite</th><th>Terminal state</th><th>Actual limit</th></tr></thead><tbody>${rows.map(row => {
    const participant = snapshot.participants.find(p => p.participant_id === row.participant_id);
    const finite = row.values.filter(Number.isFinite);
    return `<tr><td>${esc(participant.label)}</td><td>${row.evaluations} / ${history.budget}</td><td>${finite.length ? formatNumber(Math.min(...finite)) : 'None'}</td><td>${row.values.length-finite.length}</td><td>${esc(row.terminal_status)}</td><td>${row.actual_timeout_s == null ? 'Not applicable' : `${row.actual_timeout_s} s`}</td></tr>`;
  }).join('')}</tbody></table></div><details class="results-method"><summary>Selected run provenance</summary><p><a href="${fileURL(problem.history_file)}" download>Download ${esc(problem.problem)} numerical evidence</a></p><ul>${rows.map(row => `<li>${esc(snapshot.participants.find(p => p.participant_id === row.participant_id).label)}<br>Seed <code>${esc(row.instance_seed)}</code><br>Archive <code>${esc(row.archive_id)}</code>${row.attempt_id ? `<br>Attempt <code>${esc(row.attempt_id)}</code><br>Execution identity <code>${esc(row.source_agent_config_id)}</code>` : ''}</li>`).join('')}</ul></details>`;
}

async function route() {
  const ticket = ++epoch;
  const focusedId = document.activeElement?.id;
  chart?.destroy(); chart = null;
  const [path, query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  try {
    if (path.startsWith('task/')) {
      const task = snapshot.tasks.find(t => t.task_id === decodeURIComponent(path.slice(5)));
      if (!task) throw new Error('This task is not in the current snapshot');
      await detail(task,params,ticket);
    } else matrix(params);
    if (ticket === epoch) {
      window.lucide?.createIcons();
      if (previousPath !== undefined && previousPath !== path) {
        host.focus({preventScroll:true}); window.scrollTo({top:0});
      } else if (focusedId) document.getElementById(focusedId)?.focus({preventScroll:true});
      previousPath = path;
    }
  } catch (error) {
    if (ticket !== epoch) return;
    const target = document.getElementById('task-view') || host;
    target.innerHTML = `<section class="results-empty results-error" role="alert"><h2>Results could not be loaded</h2><p>${esc(error.message)}</p><a class="back-link" href="#matrix">Return to task matrix</a></section>`;
  }
}

try {
  snapshot = validateSnapshot(await readJSON(dataURL));
  window.addEventListener('hashchange',route);
  await route();
} catch (error) {
  host.innerHTML = `<div class="results-heading"><h1>NextEval Bench</h1></div><section class="results-empty results-error" role="alert"><h2>Result snapshot unavailable</h2><p>No scores are being inferred or substituted. ${esc(error.message)}</p><button id="results-retry">Retry</button></section><footer class="results-footer"><a href="${esc(archiveURL)}">Open the research archive</a></footer>`;
  document.getElementById('results-retry').onclick = () => location.reload();
}
