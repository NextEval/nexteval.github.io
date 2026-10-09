import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, join } from 'node:path';
import { validateSnapshot, validateProfiles, validateHistoryIndex, validateHistory } from './model.mjs';
import { validateUsage } from './usage.mjs';
import { createHash } from 'node:crypto';

export async function checkBundle(directory = fileURLToPath(new URL('./data/',import.meta.url))) {
  const root = resolve(directory);
  const visited = new Set();
  function privacy(value) {
    if (typeof value === 'string' && /(?:github_pat_|gh[pousr]_[A-Za-z0-9]{20}|sk-[A-Za-z0-9_-]{20}|\/(?:Users|home)\/|https?:\/\/[^\s]*[?&](?:token|signature|X-Amz-))/i.test(value)) throw new Error('Public export contains a secret, private path or signed URL');
    if (value && typeof value === 'object') for (const [key,item] of Object.entries(value)) {
      if (/^(api_key|access_token|authorization|password|cookies|messages|raw_log)$/i.test(key)) throw new Error('Raw session or credential field in public export');
      privacy(item);
    }
  }
  async function load(file) {
    const path = resolve(root,file);
    if (!path.startsWith(root + '/')) throw new Error('Asset outside data bundle');
    const data = JSON.parse(await readFile(path,'utf8'));
    privacy(data); visited.add(path);
    return data;
  }
  const data = validateSnapshot(await load('results.json'));
  if (await stat(join(root,'website-usage.json')).then(()=>true, error=>{ if (error.code === 'ENOENT') return false; throw error; })) {
    const usage = validateUsage(await load('website-usage.json'));
    if (usage.pricing_file) {
      if (usage.pricing_file !== 'pricing-snapshot.json') throw new Error('Unknown pricing asset');
      const pricing = await load(usage.pricing_file);
      if (pricing.schema !== 'nexteval.reference-pricing/1' || pricing.pricing_snapshot_id !== usage.pricing_snapshot_id || pricing.pricing_as_of !== usage.pricing_as_of
        || createHash('sha256').update(await readFile(join(root,usage.pricing_file))).digest('hex') !== usage.pricing_sha256) throw new Error('Pricing provenance mismatch');
    }
  }
  for (const task of data.tasks) {
    if (task.profiles_file) validateProfiles(await load(task.profiles_file),task);
    if (task.history_file) {
      const index = validateHistoryIndex(await load(task.history_file),task);
      for (const problem of index.problems) validateHistory(await load(problem.history_file),task,problem);
    }
  }
  async function inspect(directory) {
    for (const entry of await readdir(directory,{withFileTypes:true})) {
      const path = join(directory,entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in public numerical bundle');
      if (entry.isDirectory()) await inspect(path);
      else if (!visited.has(path)) throw new Error(`Unreferenced public asset: ${relative(root,path)}`);
    }
  }
  await inspect(root);
  return { snapshot:data.snapshot_id, tasks:data.tasks.length, participants:data.participants.length, files:visited.size };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await checkBundle(process.argv[2]),null,2));
