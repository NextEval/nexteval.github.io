// Validates a slim site bundle (bench/results/) with the bundle's own browser modules.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const SITE_CODE = Object.freeze(['app.mjs', 'chart.mjs', 'icons.mjs', 'identities.mjs', 'index.html', 'model.mjs',
  'pareto.mjs', 'plan.mjs', 'presentation.mjs', 'releases.mjs', 'results.css', 'scores.mjs', 'usage.mjs']);
const FORBIDDEN_KEY = /^(evidence_refs|sources|limitations|reference|cohort|engine|archive_id|canonical_archive_id|attempt_id|instance_seed|source_agent_config_ids?|execution_environment|reviewed_terminal_evidence|runtime_status|runtime_status_counts|actual_timeout_s|actual_timeout_counts|initial_value|profile_initial_value|primary_protocol|registry_commit|selection_sha256|usage_sources|by_tolerance|notes|.*sha256.*|.*_sha)$/;
const HASH_LIKE = /[0-9a-f]{32,}/i;

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
  const { validateSnapshot, validateProfiles, validateHistoryIndex, validateHistory } = await import(new URL('model.mjs', base));
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
  let histories = 0;
  for (const task of snapshot.tasks) {
    validateProfiles(await load('data/' + task.profiles_file), task);
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
  const missing = [...referenced].filter(f => !files.includes(f));
  if (missing.length) throw new Error('Missing site file: ' + missing.join(', '));
  return { snapshot: snapshot.snapshot_id, tasks: snapshot.tasks.length, participants: snapshot.participants.length, histories, files: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await checkSite(process.argv[2])));
}
