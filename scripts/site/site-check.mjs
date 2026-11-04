// Validates a slim site bundle (bench/results/) with the bundle's own browser modules.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const SITE_CODE = Object.freeze(['app.mjs', 'chart.mjs', 'frontier.css', 'frontier.mjs', 'icons.mjs', 'identities.mjs', 'index.html', 'logos.mjs',
  'logratio.mjs', 'model.mjs', 'pair.css', 'pareto.mjs', 'plan.mjs', 'presentation.mjs', 'profile-figures.mjs', 'releases.mjs', 'results.css', 'scores.mjs', 'usage.mjs']);
const PAIR_TOLERANCES = ['0.1', '0.001', '1e-06', '1e-09'];
const FORBIDDEN_KEY = /^(evidence_refs|sources|limitations|reference|cohort|engine|archive_id|canonical_archive_id|attempt_id|instance_seed|source_agent_config_ids?|execution_environment|reviewed_terminal_evidence|runtime_status|runtime_status_counts|actual_timeout_s|actual_timeout_counts|initial_value|profile_initial_value|primary_protocol|registry_commit|selection_sha256|usage_sources|by_tolerance|notes|.*sha256.*|.*_sha)$/;
const HASH_LIKE = /[0-9a-f]{32,}/i;
// Internal names and process words that are not public wording (machines, clouds, plans, roles, intake terms).
const NOT_PUBLIC = /volcengine|\bark\b|coding[- _]?plan|\bsyu\b|harbor|executor|attested|collaborator|campaign|backfill|hash[- ]bound|\bowner\b|\bmacos\b|\bfrps?\b|nodeguard|hostsock|shuoge|cunxin|\bPR ?\d+\b/i;

function scan(value, file, path = '') {
  if (typeof value === 'string' && HASH_LIKE.test(value)) throw new Error(`Hash-like value in ${file} at ${path}`);
  if (Array.isArray(value)) value.forEach((item, i) => scan(item, file, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    const releaseSources = file === 'data/model-releases.json' && key === 'sources' && /^models\[\d+\]$/.test(path);
    if (FORBIDDEN_KEY.test(key) && !releaseSources) throw new Error(`Unrendered field ${key} in ${file} at ${path}`);
    scan(item, file, path ? `${path}.${key}` : key);
  }
}

export async function checkSite(directory) {
  const root = resolve(directory);
  const base = pathToFileURL(root + '/');
  const { validateSnapshot, validateHistoryIndex, validateHistory, finiteScore } = await import(new URL('model.mjs', base));
  const { validateUsage } = await import(new URL('usage.mjs', base));
  const { validateReleases } = await import(new URL('releases.mjs', base));
  const { isDisplayed } = await import(new URL('presentation.mjs', base));
  const referenced = new Set(SITE_CODE);
  const load = async file => {
    const data = JSON.parse(await readFile(join(root, file), 'utf8'));
    scan(data, file); referenced.add(file);
    return data;
  };
  const snapshot = validateSnapshot(await load('data/results.json'));
  if (!snapshot.participants.every(isDisplayed)) throw new Error('Retired configuration shipped');
  validateUsage(await load('data/website-usage.json'));
  validateReleases(await load('data/model-releases.json'));
  // Pair scores, pairwise profile curves and per-agent files: exactly the displayed agents, consistent with results.json.
  const pair = await load('data/pair/scores.json');
  const agents = snapshot.participants.filter(p => p.participant_id !== 'cobyqa').map(p => p.participant_id).sort();
  if (pair.definition?.id !== snapshot.score_definition.id || pair.source_snapshot !== snapshot.snapshot_id) throw new Error('Pair scores do not match the snapshot');
  if (JSON.stringify(pair.agents.map(a => a.id).sort()) !== JSON.stringify(agents)) throw new Error('Pair agents differ from displayed configurations');
  const overlay = await load('data/pair/overlay.json');
  for (const task of snapshot.tasks) {
    const key = pair.tasks[task.task_id];
    for (const s of task.scores) {
      const want = s.participant_id === 'cobyqa' ? 0.5 : pair.agents.find(a => a.id === s.participant_id)?.pair3[key];
      if (s.score !== want || !finiteScore(s.score)) throw new Error('Task score differs from the pair score');
    }
    for (const kind of ['perf', 'data']) for (const tol of PAIR_TOLERANCES) {
      const slot = overlay.tasks[task.task_id]?.[kind]?.[tol];
      if (!slot || JSON.stringify(Object.keys(slot.curves).sort()) !== JSON.stringify(agents) || JSON.stringify(Object.keys(slot.xend).sort()) !== JSON.stringify(agents)) throw new Error('Incomplete pairwise profiles');
    }
  }
  for (const id of agents) {
    const file = await load(`data/pair/agents/${id}.json`);
    for (const task of snapshot.tasks) for (const tol of PAIR_TOLERANCES)
      if (!file[task.task_id]?.perf?.[tol]?.cobyqa || !file[task.task_id]?.data?.[tol]?.cobyqa || !file[task.task_id]?.logratio?.[tol]) throw new Error('Incomplete pair file: ' + id);
  }
  // Leaderboard data: displayed agents only, pair scores equal to data/pair/scores.json, no internal checks or case studies.
  const view = await load('data/leaderboard/view.json');
  if (view.snapshot_id !== snapshot.snapshot_id || view.counts?.agents !== agents.length || 'checks' in view || 'cards' in view) throw new Error('Leaderboard data do not match the snapshot');
  if (JSON.stringify(view.agents.map(a => a.id).sort()) !== JSON.stringify(agents)) throw new Error('Leaderboard agents differ from displayed configurations');
  for (const a of view.agents) for (const f of ['P', 'N', 'R', 'X'])
    if (a.pair[f] !== pair.agents.find(x => x.id === a.id).pair3[f]) throw new Error('Leaderboard score differs from the pair score: ' + a.id);
  let histories = 0;
  for (const task of snapshot.tasks) {
    const index = validateHistoryIndex(await load('data/' + task.history_file), task);
    for (const problem of index.problems) { validateHistory(await load('data/' + problem.history_file), task, problem); histories++; }
  }
  const files = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in site bundle');
      if (entry.isDirectory()) await walk(path); else files.push(relative(root, path));
    }
  };
  await walk(root);
  const extra = files.filter(f => !referenced.has(f.replaceAll('\\', '/')));
  if (extra.length) throw new Error('Unreferenced site file: ' + extra.slice(0, 5).join(', '));
  for (const file of files) {
    const hit = (await readFile(join(root, file), 'utf8')).match(NOT_PUBLIC);
    if (hit) throw new Error(`Not public wording "${hit[0]}" in ${file}`);
  }
  const missing = [...referenced].filter(f => !files.includes(f));
  if (missing.length) throw new Error('Missing site file: ' + missing.join(', '));
  return { snapshot: snapshot.snapshot_id, tasks: snapshot.tasks.length, participants: snapshot.participants.length, histories, pair_agents: agents.length, leaderboard_agents: view.agents.length, files: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await checkSite(process.argv[2])));
}
