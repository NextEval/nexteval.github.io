// Validates a slim site bundle (bench/results/) with the bundle's own browser modules.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const SITE_CODE = Object.freeze(['app.mjs', 'chart.mjs', 'frontier.css', 'frontier.mjs', 'icons.mjs', 'identities.mjs', 'index.html', 'logos.mjs',
  'logratio.mjs', 'model.mjs', 'pair.css', 'pareto.mjs', 'plan.mjs', 'presentation.mjs', 'profile-figures.mjs', 'releases.mjs', 'results.css', 'scores.mjs', 'usage.mjs',
  'waffle.css', 'waffle.mjs']);
const PAIR_TOLERANCES = ['0.1', '0.001', '1e-06', '1e-09'];
const FORBIDDEN_KEY = /^(evidence_refs|sources|limitations|reference|cohort|engine|archive_id|canonical_archive_id|attempt_id|instance_seed|source_agent_config_ids?|execution_environment|reviewed_terminal_evidence|runtime_status|runtime_status_counts|actual_timeout_s|actual_timeout_counts|initial_value|profile_initial_value|primary_protocol|registry_commit|selection_sha256|usage_sources|by_tolerance|notes|.*sha256.*|.*_sha)$/;
const HASH_LIKE = /[0-9a-f]{32,}/i;
// Words and word pairs that are internal names rather than public wording (machines, clouds and plans, roles, people,
// tools), as sha256 of their lower-case text; the plain list is kept with the website build tests.
export const NOT_PUBLIC_SHA256 = new Set(["004b372cb547494db2f62d4b28602329781f2b358e5dbb14a62ad7e5767b3b4a", "0c4243c45502e6c965536517cc132e91c66ebfe8155a47aaa6cfdeab35b24664", "13a87448ed48891750c8c55bc2072a21137055f0833e76b8647f5f3de92976fd", "18c0a5199f6ee49ef20ac5882a8c573f0b25cdaa849c937ce6a732bdabd74bb7", "1ee58f516cc4ed62c63513051315c162bbb3198603ed7abe30e6c2b7f3cef300", "39f7eccfbbb11472602d344785a9b9ce373e12686741a2d40d9f34d18a91fd33", "3dc260b2472062d9c57bd930b02f23831d917b8f3e3234b6d63964a53c31d3aa", "4a36468a74fa238c675bcebd9f3722e64ec2eee968818ffaa0d57fe2ceb447dc", "4c1029697ee358715d3a14a2add817c4b01651440de808371f78165ac90dc581", "52563f898870e6ce7817b3ffbd430df2104719a74fc408cbe24eb9f481078ce4", "53adf83d9f7b4dd136fee848946a5ea6d28640406aa260d1bb6adb79dccb58ee", "61de55ba3388aec4fdf6ecfc6eef846fb0f1b13e28cc8381270c27ffa313aee5", "682fbae20f3428bcec4c117c57bea18d438c4758d972909b41dbe22884e0d6b8", "7829dfe67fcf54311864fc39a99dd11ed01159c5a3c74e8d702265a6812878af", "7a6ba712646fca91dffef1c1a5c4ce0e49dc837f40b7d2495fd1a029e0dea68a", "80812d7992dd498c03bbb6b797f4ac179be160f921c462b0b8a4a9bd1ca3b4be", "8fba13dab71d6fdd8a9b9db1f06e81315dfbfd69167b6097f724604db3c91cdf", "a0c0485eff9c817deee7190edf264622b1677fc992920657411b36a6aed48f83", "a622b10ddc23c8c9e9ec39d4833ae9b7b772ef40cb430425cb1689b76ec3490c", "a8fa7fd60893411a49907b5545ccf9c47ed8073cc38e2ac3b79c4f6156cd7755", "af76eb7f9a5683f436ad133dd307447a942cf06dcc9dadb3b70307dc5bf7355e", "b1b149fcdaf89d22d8f80acefc829101068335c9408cf67c72f6e6a4ceac78c4", "b4eeef87ef1c84a7d3c17e9b63bf16558f536572b2a18fcce3a7e94f53b4d837", "b878a6801d9a9e68b30ed63430bb5e0bddcd984a37a3ee385abc27ff031c7fe7", "c1472135b14c77c8bef98e73f70208325fa0dcf1e6bd668ae9b31a9cea295fe7", "c1d64b2d4cb30f1be788cc4d246ddd9fc1fe85a3eb3a85a3de33829dfaf6ce7d", "cde48537ca2c28084ff560826d0e6388b7c57a51497a6cb56f397289e52ff41b", "e6713efde1e27d8708e8882e0a300063584f179bcc5faccdf88876f2cfd76ba9", "f0166b974799f63c331e6c774576df4809ca448fb9664d2bcf5eb693291eb2bb", "f01ea329ad9fc5d007b0e0442ad991f93b0c4be9f0ee729cffd1194774a1eeaf"]);
const seen = new Map();
const internal = word => { if (!seen.has(word)) seen.set(word, NOT_PUBLIC_SHA256.has(createHash('sha256').update(word).digest('hex'))); return seen.get(word); };
// The first internal word of a text as 'word <index>' (never the word itself), or null.
export function notPublic(text) {
  if (/\bPR ?\d+\b/.test(text)) return 'PR number';
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (let i = 0; i < words.length; i++)
    if (/[a-z]/.test(words[i]) && (internal(words[i]) || (i + 1 < words.length && internal(words[i] + ' ' + words[i + 1])))) return 'word ' + i;
  return null;
}

function scan(value, file, path = '') {
  if (typeof value === 'string' && HASH_LIKE.test(value)) throw new Error(`Hash-like value in ${file} at ${path}`);
  if (Array.isArray(value)) value.forEach((item, i) => scan(item, file, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    const releaseSources = file === 'data/model-releases.json' && key === 'sources' && /^models\[\d+\]$/.test(path);
    if (FORBIDDEN_KEY.test(key) && !releaseSources) throw new Error(`Unrendered field ${key} in ${file} at ${path}`);
    scan(item, file, path ? `${path}.${key}` : key);
  }
}

// Leaderboard cost: the full-evaluation totals equal the sum of the per-configuration usage figures of the four tasks
// (measured, otherwise the labelled estimate). A configuration with an unavailable figure has no total; a sum over
// some of its tasks never passes. usageFigures is the bundle's own (presentation.mjs).
export function checkLeaderboardCost(view, snapshot, usage, usageFigures) {
  const close = (a, b) => typeof a === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  const costs = [];
  let estimatedAgents = 0;
  for (const a of view.agents) {
    const participant = snapshot.participants.find(p => p.participant_id === a.id);
    let usd = 0, tokens = 0, estimated = false;
    for (const task of snapshot.tasks) {
      const group = usage.groups.find(g => g.participant_id === a.id && g.task_id === task.task_id);
      if (!group) throw new Error('Leaderboard agent without a usage group: ' + a.id);
      const figures = usageFigures(usage, { group, participant }, task);
      usd = usd === null || figures.totalCost === null ? null : usd + figures.totalCost;
      tokens = tokens === null || figures.totalTokens === null ? null : tokens + figures.totalTokens;
      estimated ||= (figures.cost !== null && !Number.isFinite(group.mean_api_equivalent_cost_usd_per_run))
        || (figures.tokens !== null && !Number.isFinite(group.mean_total_tokens_per_run));
    }
    if (usd === null ? a.cost_usd !== null : !close(a.cost_usd, usd)) throw new Error('Leaderboard cost differs from the usage figures: ' + a.id);
    if (a.cost_tokens !== tokens) throw new Error('Leaderboard tokens differ from the usage figures: ' + a.id);
    if (usd !== null) costs.push(usd);
    estimatedAgents += estimated;
  }
  costs.sort((x, y) => x - y);
  const middle = costs.length >> 1, median = costs.length % 2 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
  const top = view.agents.find(a => a.id === view.cost?.top_agent);
  if (!costs.length || !close(view.cost.median_usd, median) || !close(view.cost.min_usd, costs[0]) || !close(view.cost.max_usd, costs.at(-1))
    || view.cost.agents_with_cost !== costs.length || view.cost.unavailable_agents !== view.agents.length - costs.length
    || view.cost.estimated_agents !== estimatedAgents || !top || view.cost.top_agent_usd !== top.cost_usd) throw new Error('Leaderboard cost summary differs from the usage figures');
  return { agents_with_cost: costs.length, estimated_agents: estimatedAgents, median_usd: median, min_usd: costs[0], max_usd: costs.at(-1) };
}

export async function checkSite(directory) {
  const root = resolve(directory);
  const base = pathToFileURL(root + '/');
  const { validateSnapshot, validateHistoryIndex, validateHistory, finiteScore } = await import(new URL('model.mjs', base));
  const { validateUsage } = await import(new URL('usage.mjs', base));
  const { validateReleases } = await import(new URL('releases.mjs', base));
  const { isDisplayed, usageFigures } = await import(new URL('presentation.mjs', base));
  const referenced = new Set(SITE_CODE);
  const load = async file => {
    const data = JSON.parse(await readFile(join(root, file), 'utf8'));
    scan(data, file); referenced.add(file);
    return data;
  };
  const snapshot = validateSnapshot(await load('data/results.json'));
  if (!snapshot.participants.every(isDisplayed)) throw new Error('Retired configuration shipped');
  const usage = await load('data/website-usage.json');
  validateUsage(usage);
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
  checkLeaderboardCost(view, snapshot, usage, usageFigures);
  // Waffle data: the per-case counts of the displayed agents, decoded by the view's own module; their beat, loss, level
  // and mixed counts equal the leaderboard's, and so does each problem-feature share of cases beaten.
  const { decodeCases, caseCode, FEATS } = await import(new URL('waffle.mjs', base));
  const cases = decodeCases(await load('data/leaderboard/cases.json'), view);
  if (cases.agents.size !== agents.length || cases.problems.length !== view.counts.problems) throw new Error('Waffle data do not match the leaderboard');
  for (const a of view.agents) for (const f of FEATS) {
    const row = cases.agents.get(a.id)[f], n = { W: 0, L: 0, T: 0, M: 0 };
    row.faster.forEach((u, i) => n[caseCode(u, row.slower[i])]++);
    if (n.W !== a.counts.beat[f] || n.L !== a.counts.loss[f] || n.T !== a.counts.tie[f] || n.M !== a.counts.mixed[f]) throw new Error('Waffle counts differ from the leaderboard: ' + a.id);
  }
  for (const item of view.items) {
    const p = cases.problems.find(x => x.problem === item.problem);
    const beats = view.agents.reduce((s, a) => s + cases.agents.get(a.id)[item.feature].beats[p.index], 0);
    if (p.dim !== item.dim || beats / item.runs !== item.share) throw new Error('Waffle share differs from the leaderboard: ' + item.problem);
  }
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
    const hit = notPublic(await readFile(join(root, file), 'utf8'));
    if (hit) throw new Error(`Internal wording (${hit}) in ${file}`);
  }
  const missing = [...referenced].filter(f => !files.includes(f));
  if (missing.length) throw new Error('Missing site file: ' + missing.join(', '));
  return { snapshot: snapshot.snapshot_id, tasks: snapshot.tasks.length, participants: snapshot.participants.length, histories, pair_agents: agents.length, leaderboard_agents: view.agents.length, waffle_agents: cases.agents.size, files: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await checkSite(process.argv[2])));
}
