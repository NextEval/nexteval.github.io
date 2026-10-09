import { FEATURES, validateSnapshot, validateProfiles, validateHistoryIndex, validateHistory, historyChartData, sortedParticipants, matrixVisibility, scoreText, featureFor, assetPath, chartData } from './model.mjs';
import { ScientificChart, formatNumber } from './chart.mjs';
import { icon } from './icons.mjs';
import { PLAN, plannedParticipants } from './plan.mjs';
import { relativeScore, referenceScore, relativeScoreExport, heatColor, HEAT_COLORS } from './scores.mjs';
import { validateUsage, paretoData, pricingLinks } from './usage.mjs';
import { ParetoChart, compactNumber, dollarNumber } from './pareto.mjs';
import { validateReleases, releaseData } from './releases.mjs';

const host = document.getElementById('results-app');
document.querySelector('.results-skip')?.addEventListener('click', event => {
  event.preventDefault(); host.focus(); host.scrollIntoView({block:'start'});
});
const dataURL = new URL('./data/results.json', import.meta.url);
const usageURL = new URL('./data/website-usage.json', import.meta.url);
const releasesURL = new URL('./data/model-releases.json', import.meta.url);
const archiveURL = host.dataset.archive || '../index.html#profiles';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
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
  if (p.display_name) return p.display_name;
  if (!p.model || p.harness === 'reference' || p.model === 'none') return p.label;
  const model = p.model.split('/').at(-1);
  return ({ 'gpt-5.5':'GPT-5.5', 'gpt-5.6-sol':'GPT-5.6 Sol', 'gpt-5.6-terra':'GPT-5.6 Terra', 'gpt-5.6-luna':'GPT-5.6 Luna', 'gpt-6-sol':'GPT-6 Sol', 'gpt-6-luna':'GPT-6 Luna', 'claude-sonnet-5':'Claude Sonnet 5', 'claude-opus-5-5':'Claude Opus 5.5', 'deepseek-v4-flash':'DeepSeek V4 Flash' }[model] || p.model);
};
const harnessFor = p => ({'codex':'Codex','claude-code':'Claude Code','scipy':'SciPy'}[p.harness] || p.harness);
const detailFor = p => [harnessFor(p), p.effort].filter(Boolean).join(' / ');
const chartParticipants = () => snapshot.participants.map(p => ({...p,label:reference(p) ? p.label : `${labelFor(p)} / ${detailFor(p)}`}));
const reference = p => /cobyqa/i.test(p.label);
const dateLabel = () => snapshot.generated_at ? new Date(snapshot.generated_at).toISOString().slice(0,10) : 'Versioned snapshot';
const dashboardViews = (view, task, family = '') => `<nav class="results-tabs dashboard-views" aria-label="Results views"><a href="#matrix?${new URLSearchParams({sort:task?.task_id || '',family})}" ${view === 'matrix' ? 'aria-current="page"' : ''}>${icon('grid-2x2')}Matrix</a><a href="#pareto?${new URLSearchParams({task:task?.task_id || '',family})}" ${view === 'pareto' ? 'aria-current="page"' : ''}>${icon('chart-scatter')}Pareto</a></nav>`;

function footer() {
  const scoreDownload = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(relativeScoreExport(snapshot), null, 2));
  return `<footer class="results-footer"><span>NextEval Bench / ${esc(dateLabel())}</span><div class="results-links"><a href="${esc(scoreDownload)}" download="cobyqa-relative-scores.json">Scores JSON</a><a href="${esc(dataURL.href)}" download>Original snapshot JSON</a><a href="https://github.com/NextEval/nexteval-bench-data" title="Private data archive; repository access required">Data archive</a></div></footer>`;
}

function method(task) {
  return `<details class="results-method"><summary>Score and comparison protocol</summary>
    <p>Displayed score = p<sup>4</sup> / (p<sup>4</sup> + b<sup>4</sup>), where p is the method's original OptiProfiler score and b is COBYQA's score in the same task and frozen comparison. The fixed exponent 4 expands display contrast without changing the ranking. COBYQA = 0.50; above 0.50 means a higher aggregate score, below 0.50 a lower one. This display scale is not an effect size, win probability, or claim of statistical significance.</p>
    <p>Original scores are normalized performance-profile areas, averaged over 10 tolerances from 10<sup>-1</sup> to 10<sup>-10</sup>. The transformation is applied after that average. Profiles and original scores remain unchanged. A missing or zero baseline makes the relative score unavailable. There is no cross-task average.</p>
    <p>Each target uses the best budgeted history among that task's comparison members, including its canonical COBYQA reference, for the same problem and repetition. Adding a member requires a new complete comparison.</p>
    <p>Timeouts stay in the comparison denominator. Execution metadata is retained in the downloadable records and data archive.</p>
    ${task ? `<p>Comparison <code>${esc(task.comparison_id)}</code><br>Task <code>${esc(task.task_id)}</code> / version ${esc(task.task_version)}<br>Cohort <code>${esc(task.cohort)}</code></p>` : ''}
    <p>Snapshot <code>${esc(snapshot.snapshot_id)}</code><br>Registry commit <code>${esc(snapshot.registry_commit)}</code></p>
    ${task?.limitations?.length ? `<ul>${task.limitations.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}
  </details>`;
}

function matrix(params) {
  const tasks = FEATURES.map(feature => snapshot.tasks.find(t => featureFor(t)?.key === feature.key));
  const sortable = tasks.filter(t => t?.scores.length);
  const selected = sortable.find(t => t.task_id === params.get('sort')) || sortable[0];
  const family = PLAN.families.some(f => f.family === params.get('family')) ? params.get('family') : '';
  const allRows = sortedParticipants(snapshot, selected?.task_id, plannedParticipants());
  const filteredRows = allRows.filter(p => !family || p.family === family || reference(p));
  const expanded = params.get('unpublished') === '1';
  const {rows, unpublished} = matrixVisibility(snapshot, filteredRows, expanded);
  const cells = new Map(snapshot.matrix.map(c => [JSON.stringify([c.participant_id,c.task_id]), c]));
  host.innerHTML = `<div class="results-heading"><div><h1>Task matrix</h1><p>NextEval Bench / agent performance across packaged optimization tests</p></div><span class="results-edition">${esc(dateLabel())}</span></div>
    ${dashboardViews('matrix',selected,family)}
    <div class="results-toolbar"><div class="results-scope"><span>S2MPJ</span><span>Unconstrained</span><span>Dimensions &le; 5</span><span>50 &times; n evaluations</span></div>
      <label class="results-sort" for="family-filter">Family<select id="family-filter"><option value="">All families</option>${PLAN.families.map(f => `<option ${f.family === family ? 'selected' : ''}>${esc(f.family)}</option>`).join('')}</select></label>
      <label class="results-sort" for="sort-task">Sort by<select id="sort-task" ${selected ? '' : 'disabled'}>${sortable.map(t => `<option value="${esc(t.task_id)}" ${t === selected ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label></div>
    <div class="matrix-meta"><span>${rows.length} of ${filteredRows.length} configurations / ${sortable.length} published comparisons</span><div class="heat-legend"><span>COBYQA = 0.50</span><span>0</span><span class="heat-scale" aria-hidden="true" style="background:linear-gradient(to right,${HEAT_COLORS.join(',')})"></span><span>1</span></div></div>
    <div class="results-table-scroll" role="region" aria-label="Agent scores by task" tabindex="0"><table class="results-matrix" id="model-matrix"><caption>COBYQA-relative display scores sorted by ${esc(selected?.label || 'task')}. Empty cells have no published score.</caption><colgroup><col><col><col><col></colgroup><thead><tr><th scope="col">MODEL / AGENT</th>${FEATURES.map((feature,i) => {
      const task = tasks[i];
      return `<th scope="col"><button class="task-column ${task === selected ? 'selected' : ''}" ${task ? `data-task="${esc(task.task_id)}"` : 'disabled'} title="${esc(feature.description)}">${icon(feature.icon)}<span>${esc(task?.label || feature.label)}</span><small>${task?.scores.length ? `${task.grid.problems} problems / ${task.grid.repetitions} repeats` : 'Not published'}</small></button></th>`;
    }).join('')}</tr></thead><tbody>${rows.map(p => `<tr class="${reference(p) ? 'reference' : ''}"><th scope="row" ${p.condition ? `title="${esc(p.condition)}"` : ''}><span class="participant-name">${esc(labelFor(p))}${!reference(p) && p.effort ? ` <span class="participant-effort">(${esc(p.effort)})</span>` : ''}</span><span class="participant-detail">${esc(reference(p) ? 'Numerical reference' : harnessFor(p))}${p.condition ? ' / conditional' : ''}</span></th>${tasks.map(t => {
      const c = t && cells.get(JSON.stringify([p.participant_id,t.task_id]));
      const baseline = referenceScore(t), score = relativeScore(c?.score, baseline);
      if (score === null) return c?.score != null ? '<td aria-label="Reference score unavailable" title="COBYQA reference score is missing or zero"></td>' : '<td aria-label="No published result" title="No published result"></td>';
      return `<td style="background:${heatColor(score)}" data-score="${score}"><a href="${taskURL(t)}" title="Relative: ${score.toFixed(6)}; original: ${c.score.toFixed(6)}; COBYQA original: ${baseline.toFixed(6)}" aria-label="${esc(p.label)}, ${esc(t.label)}, COBYQA-relative score ${scoreText(score)}">${scoreText(score)}</a></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    ${unpublished ? `<button type="button" class="matrix-expand" id="toggle-unpublished" aria-expanded="${expanded}" aria-controls="model-matrix" title="Configurations without published scores">${icon(expanded ? 'chevron-up' : 'chevron-down')}<span>${expanded ? 'Hide' : 'Show'} ${unpublished} ${expanded ? 'unpublished' : 'more'} configurations</span></button>` : ''}
    ${rows.length ? '' : '<section class="results-empty"><h2>No scored comparison released</h2><p>Completed coverage alone is not a score. Results will appear after the offline comparison export is verified.</p></section>'}
    <div class="matrix-foot"><span>Higher is better / COBYQA = 0.50 / empty = unavailable</span><span>Order: ${esc(selected?.label || 'none')} / descending</span></div>
    ${method()}${footer()}`;
  const updateMatrix = (showUnpublished = expanded) => {
    const next = new URLSearchParams({sort:document.getElementById('sort-task').value, family:document.getElementById('family-filter').value});
    if (showUnpublished) next.set('unpublished','1');
    location.hash = 'matrix?' + next;
  };
  document.getElementById('sort-task').onchange = () => updateMatrix();
  document.getElementById('family-filter').onchange = () => updateMatrix();
  const expandButton = document.getElementById('toggle-unpublished');
  if (expandButton) expandButton.onclick = () => {
    updateMatrix(!expanded);
  };
  host.querySelectorAll('[data-task]').forEach(button => button.onclick = () => { location.hash = taskURL(snapshot.tasks.find(t => t.task_id === button.dataset.task)); });
}

async function pareto(params, ticket) {
  const task = snapshot.tasks.find(t => t.task_id === params.get('task') && t.scores.length)
    || snapshot.tasks.find(t => featureFor(t)?.key === 'perturbed_x0' && t.scores.length)
    || snapshot.tasks.find(t => t.scores.length);
  const family = PLAN.families.some(f => f.family === params.get('family')) ? params.get('family') : '';
  const metric = ['tokens','release_date'].includes(params.get('metric')) ? params.get('metric') : 'cost';
  const released = metric === 'release_date';
  const scale = params.get('scale') === 'linear' ? 'linear' : 'log';
  const metricControl = `<label class="results-sort" for="pareto-metric">X axis<select id="pareto-metric"><option value="cost" ${metric === 'cost' ? 'selected' : ''}>API-equivalent USD / run</option><option value="tokens" ${metric === 'tokens' ? 'selected' : ''}>Total tokens / run</option><option value="release_date" ${released ? 'selected' : ''}>Release date</option></select></label>`;
  host.innerHTML = `<div class="results-heading"><div><h1>${released ? 'Score & release date' : 'Score & consumption'}</h1><p>NextEval Bench / one packaged task, the same published scores</p></div><span class="results-edition">${esc(dateLabel())}</span></div>
    ${dashboardViews('pareto',task,family)}
    <div class="results-toolbar pareto-toolbar"><label class="results-sort" for="pareto-task">Task<select id="pareto-task">${snapshot.tasks.filter(t=>t.scores.length).map(t=>`<option value="${esc(t.task_id)}" ${t === task ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      <label class="results-sort" for="pareto-family">Family<select id="pareto-family"><option value="">All families</option>${PLAN.families.map(f=>`<option ${f.family === family ? 'selected' : ''}>${esc(f.family)}</option>`).join('')}</select></label></div>
    <section id="pareto-view" aria-live="polite"><p>Loading ${released ? 'release dates' : 'verified usage'}</p><div class="pareto-axis-controls">${metricControl}</div></section>${method(task)}${footer()}`;
  const update = () => { location.hash = 'pareto?' + new URLSearchParams({task:document.getElementById('pareto-task').value,family:document.getElementById('pareto-family').value,metric:document.getElementById('pareto-metric').value,scale:document.getElementById('pareto-log') ? document.getElementById('pareto-log').checked ? 'log' : 'linear' : scale}); };
  for (const id of ['pareto-task','pareto-family','pareto-metric']) document.getElementById(id).onchange = update;
  const view = document.getElementById('pareto-view');
  let usage = null, releases = null;
  try {
    if (released) releases = validateReleases(await readJSON(releasesURL));
    try { usage = validateUsage(await readJSON(usageURL)); }
    catch (error) { if (!released) throw error; }
  }
  catch (error) {
    if (ticket !== epoch) return;
    view.innerHTML = `<section class="results-empty"><h2>${released ? 'Release snapshot' : 'Usage snapshot'} unavailable</h2><p>No ${released ? 'dates' : 'costs or tokens'} are inferred. ${esc(error.message)}</p></section><div class="pareto-axis-controls">${metricControl}</div>`;
    document.getElementById('pareto-metric').onchange = update;
    return;
  }
  if (ticket !== epoch) return;
  const data = released ? releaseData(snapshot,releases,task,family,usage) : paretoData(snapshot,usage,task,metric,family);
  const positive = data.points.every(p=>p.x > 0), log = !released && scale === 'log' && positive;
  const notes = `API-equivalent cost uses public standard list prices, not a Coding Plan bill. Tokens include input, output and cache categories under the audited accounting policy. Ordinary timeouts remain in each cohort. COBYQA has no comparable model usage and is not plotted. The frontier compares displayed configurations only; it is not a statistical significance test.`;
  view.innerHTML = `<div class="matrix-meta"><span>${data.points.length} of ${data.eligible} scored configurations / ${task.grid.cells} runs each</span><span>${released ? `Dates checked ${esc(data.checked_at)}` : metric === 'cost' && data.pricing_as_of ? `Prices as of ${esc(data.pricing_as_of)}` : 'Verified usage only'}</span></div>
    ${data.points.length ? `<div class="pareto-layout"><div><p class="chart-unit">COBYQA-relative score / higher is better</p><div id="pareto-chart" class="pareto-chart"></div><div class="pareto-axis-controls">${metricControl}${released ? '' : `<label class="pareto-log-control"><input type="checkbox" id="pareto-log" ${log ? 'checked' : ''} ${positive ? '' : 'disabled'}>Log axis</label>`}</div><p class="chart-axis">${released ? 'Model release date / UTC / best score available by date' : `Mean ${metric === 'cost' ? 'API-equivalent USD' : 'total tokens'} per run / ${log ? 'log scale / ' : ''}lower is better`}</p><div class="pareto-key"><span><i class="frontier-key"></i>Non-dominated</span><span><i></i>Other configurations</span><span>COBYQA score = 0.50</span></div></div><aside id="pareto-detail" class="pareto-detail" aria-label="Selected configuration"></aside></div>
    <details class="pareto-config-list"><summary>Configurations (${data.points.length})</summary><ul class="pareto-configurations" aria-label="Configurations">${data.points.map(p=>`<li><button data-config="${esc(p.participant.participant_id)}"><span><strong>${esc(labelFor(p.participant))} <span class="muted">(${esc(p.participant.effort)})</span></strong><small>${esc(harnessFor(p.participant))}</small></span><span class="pareto-value">${scoreText(p.score)}<small>${released ? esc(p.release.released_at) : metric === 'cost' ? dollarNumber(p.x) : compactNumber(p.x)}</small></span></button></li>`).join('')}</ul></details>` : `<section class="results-empty"><h2>${released ? 'No verified release dates for this selection' : data.mixedPricing ? 'Price snapshots do not match' : 'No complete usage for this selection'}</h2><p>${data.mixedPricing ? 'Dollar points need a common price date. The token view remains available.' : 'Scores stay published in Matrix. Missing metadata is not inferred.'}</p></section><div class="pareto-axis-controls">${metricControl}</div>`}
    ${data.omitted ? `<p class="profile-note">${data.omitted} scored configurations omitted: ${released ? 'release date unavailable' : 'usage incomplete or not priced under the common snapshot'}.</p>` : ''}
    ${released ? `<details class="results-method"><summary>Release date policy and sources</summary><p>${esc(releases.notes)} The frontier prefers earlier release dates and higher scores, following <a href="https://www.terminal-bench-science.ai/?view=pareto" target="_blank" rel="noopener noreferrer">TB-Science</a>. It is descriptive, not a causal estimate of model progress. Each task keeps its own frozen comparison.</p><p><a href="${esc(releasesURL.href)}" download>Download model release dates and sources</a></p></details>` : `<details class="results-method"><summary>Usage and price policy</summary><p>${notes}</p>${usage.pricing_snapshot_id ? `<p>Price snapshot <code>${esc(usage.pricing_snapshot_id)}</code>${usage.pricing_sha256 ? `<br>SHA-256 <code>${esc(usage.pricing_sha256)}</code>` : ''}</p>` : ''}<p><a href="${esc(usageURL.href)}" download>Download accounting snapshot</a>${usage.pricing_file === 'pricing-snapshot.json' ? ` / <a href="${fileURL(usage.pricing_file)}" download>Download price snapshot</a>` : ''}</p></details>`}`;
  document.getElementById('pareto-metric').onchange = update;
  if (!data.points.length) return;
  const detail = document.getElementById('pareto-detail');
  detail.hidden = true;
  const select = point => {
    const p = point.participant, g = point.group || {};
    const links = pricingLinks(released ? point.release.sources : g.pricing_sources);
    const metrics = [
      ['Score',scoreText(point.score)], ['Runs',`${task.grid.cells} / ${task.grid.cells}`],
      ...(released ? [['Model release date',point.release.released_at]] : []),
      ['Mean tokens / run',g.mean_total_tokens_per_run == null ? 'Unavailable' : compactNumber(g.mean_total_tokens_per_run)],
      ['Total tokens',g.total_tokens == null ? 'Unavailable' : new Intl.NumberFormat('en-US').format(g.total_tokens)],
      ['Mean API-equivalent USD / run',g.mean_api_equivalent_cost_usd_per_run == null ? 'Unavailable' : dollarNumber(g.mean_api_equivalent_cost_usd_per_run)],
      ['Total API-equivalent USD',g.total_api_equivalent_cost_usd == null ? 'Unavailable' : dollarNumber(g.total_api_equivalent_cost_usd)],
      ['Price date',g.pricing_as_of || 'Unavailable']
    ];
    detail.innerHTML = `<div><span class="pareto-status">${data.frontier.includes(point) ? 'NON-DOMINATED' : 'CONFIGURATION'}</span><h2>${esc(labelFor(p))}</h2><p class="muted">${esc(detailFor(p))}</p></div><dl>${metrics.map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><div class="pareto-links"><a class="back-link" href="${taskURL(task)}">Task profiles ${icon('arrow-up-right')}</a><div class="pareto-sources">${links.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`).join('')}</div></div><button type="button" class="pareto-close" aria-label="Close details" title="Close details">${icon('x')}</button>`;
    detail.hidden = false;
    detail.querySelector('.pareto-close').onclick = () => {
      detail.hidden = true;
      chart.select(null);
      view.querySelectorAll('[data-config]').forEach(button=>button.setAttribute('aria-pressed','false'));
      document.getElementById('pareto-chart').focus({preventScroll:true});
    };
    view.querySelectorAll('[data-config]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.config === p.participant_id)));
    window.lucide?.createIcons();
  };
  if (document.getElementById('pareto-log')) document.getElementById('pareto-log').onchange = update;
  chart = new ParetoChart(document.getElementById('pareto-chart'),data,metric,select,labelFor,log ? 'log' : 'linear',harnessFor);
  document.getElementById('pareto-chart').tabIndex = -1;
  view.querySelectorAll('[data-config]').forEach(button => button.onclick = () => {
    const point = data.points.find(p=>p.participant.participant_id === button.dataset.config);
    select(point); chart.select(point.participant.participant_id);
  });
}

function coverage(task) {
  return `<section class="task-coverage"><h2>Coverage</h2><div class="results-table-scroll"><table class="coverage-table"><thead><tr><th>Configuration</th><th>Terminal / expected</th><th>Normal</th><th>Timeout</th></tr></thead><tbody>${(task.coverage || []).map(row => {
    const participant = snapshot.participants.find(p => p.participant_id === row.participant_id);
    return `<tr><td>${esc(participant.label)}</td><td>${row.terminal} / ${row.expected}</td><td>${row.normal}</td><td>${row.timeout}</td></tr>`;
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
  document.getElementById('history-receipt').innerHTML = `<p class="profile-note">Best observed clean value after each recorded evaluation / lower is better / curves end where runs end. Nonfinite observations remain counted. This is not the agent-returned solution.</p><div class="results-table-scroll"><table class="coverage-table"><thead><tr><th>Configuration</th><th>Evaluations</th><th>Best finite value</th><th>Nonfinite</th><th>Terminal state</th></tr></thead><tbody>${rows.map(row => {
    const participant = snapshot.participants.find(p => p.participant_id === row.participant_id);
    const finite = row.values.filter(Number.isFinite);
    return `<tr><td>${esc(participant.label)}</td><td>${row.evaluations} / ${history.budget}</td><td>${finite.length ? formatNumber(Math.min(...finite)) : 'None'}</td><td>${row.values.length-finite.length}</td><td>${esc(row.terminal_status)}</td></tr>`;
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
    } else if (path === 'pareto') await pareto(params,ticket);
    else matrix(params);
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
