// Builds _site/: the allowlisted public pages plus the pinned slim results bundle.
// Only files tracked by Git under the allowlist and the verified release tarball are published.
// Pages are rendered on the way: build flags (site-flags.json) choose between marked alternatives,
// and the overview's Bench preview is generated from the pinned bundle.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const ALLOWED_FILES = Object.freeze(['index.html', 'site.css', 'slogan.css', 'navigation.js',
  'bench/index.html', 'bench/archive.html', 'bench/ten-repeat.html']);
export const ALLOWED_DIRS = Object.freeze(['solver/', 'site-assets/', 'bench/vendor/', 'bench/assets/brand/']);
export const source = JSON.parse(readFileSync(join(root, 'bench/results-source.json'), 'utf8'));
const site = join(root, '_site');
const sha = raw => createHash('sha256').update(raw).digest('hex');

// Build flags. site-flags.json holds the published values; an environment variable of the same name
// (true/false) overrides one flag for a local build.
export const FLAG_NAMES = Object.freeze(['SOLVER_RELEASED']);
export function readFlags(environment = process.env) {
  const stored = JSON.parse(readFileSync(join(root, 'site-flags.json'), 'utf8'));
  const flags = {};
  for (const name of FLAG_NAMES) {
    const value = environment[name] ?? stored[name];
    if (value === true || value === 'true') flags[name] = true;
    else if (value === false || value === 'false') flags[name] = false;
    else throw new Error(`Build flag ${name} must be true or false`);
  }
  return flags;
}

// Page rendering: <!--@if FLAG-->A<!--@else-->B<!--@endif--> keeps A or B; <!--@name-->fallback<!--@end-->
// is replaced by a generated block when the build has one, and keeps its fallback otherwise.
export function renderPage(html, flags, blocks = {}) {
  let out = html.replace(/<!--@if (\w+)-->([\s\S]*?)<!--@endif-->/g, (_, name, body) => {
    if (!(name in flags)) throw new Error('Unknown build flag: ' + name);
    const [yes, no = ''] = body.split('<!--@else-->');
    return flags[name] ? yes : no;
  });
  out = out.replace(/<!--@([a-z-]+)-->([\s\S]*?)<!--@end-->/g, (_, name, fallback) => blocks[name] ?? fallback);
  if (out.includes('<!--@')) throw new Error('Unfinished build marker');
  return out;
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The overview's Bench preview: counts and the first agents of the leaderboard, from the bundle's own data and marks.
export const PREVIEW_ROWS = 6;
const COUNT_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export function benchPreview(view, { logo, FAMILY_COLORS }, hasWaffle) {
  const n = view.counts, top = view.agents.slice(0, PREVIEW_ROWS), count = COUNT_WORD[top.length];
  const [d0, d1] = [0.25, 0.8], X = x => ((Math.max(d0, Math.min(d1, x)) - d0) / (d1 - d0) * 1000).toFixed(1);
  const ticks = []; for (let t = d0; t <= d1 + 1e-9; t += 0.05) ticks.push(+t.toFixed(2));
  const bar = a => `<svg viewBox="0 0 1000 22" preserveAspectRatio="none" aria-hidden="true">${ticks.map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="22" class="grid" vector-effect="non-scaling-stroke"/>`).join('')}<rect x="${Math.min(X(0.5), X(a.pair.mean))}" y="5" width="${Math.max(1.5, Math.abs(X(a.pair.mean) - X(0.5))).toFixed(1)}" height="12" fill="${FAMILY_COLORS[a.family] || '#c8cdc9'}" opacity=".9"/><line x1="${X(0.5)}" x2="${X(0.5)}" y1="0" y2="22" class="ref" vector-effect="non-scaling-stroke"/></svg>`;
  const views = [['leaderboard', 'Leaderboard'], ['matrix', 'Matrix'], ...(hasWaffle ? [['waffle', 'Waffle']] : []), ['profiles', 'Profiles'], ['pareto', 'Pareto'], ['method', 'Methodology']];
  return `<p class="page-kicker"><i aria-hidden="true"></i>Last updated: ${esc(view.last_updated)} &middot; snapshot ${esc(view.snapshot_id.slice(0, 12))}</p>
      <ul class="facts">
        <li><strong>${n.agents}</strong><span>agents, each a harness driving a model</span></li>
        <li><strong>${n.problems}</strong><span>problems &times; ${n.features} features &times; ${n.repeats} repeats</span></li>
        <li><strong>${n.cases_per_agent.toLocaleString('en-US')}</strong><span>cases per agent, each compared with COBYQA</span></li>
      </ul>
      <p class="section-note">First ${count} of ${n.agents} agents by pair score against COBYQA (4-task mean). COBYQA = 0.500; above means ahead of COBYQA. The beat-COBYQA rate is the share of cases in which the agent reaches every tolerance no later than COBYQA and at least one strictly earlier.</p>
      <div class="table-scroll" style="margin-top:12px"><table class="data-table"><caption>First ${count} agents of the NextEval Bench leaderboard</caption>
        <thead><tr><th class="rank" scope="col">Rank</th><th scope="col">Agent</th><th class="board-harness" scope="col">Harness</th><th class="board-bar" scope="col">From COBYQA (0.500)</th><th class="num" scope="col">Pair score</th><th class="num" scope="col">Beat rate</th></tr></thead>
        <tbody>${top.map((a, i) => `
          <tr><td class="rank">${i + 1}</td><th scope="row"><a class="board-who" href="bench/#agent/${encodeURIComponent(a.id)}">${logo(a.family, { size: 15 })}<span>${esc(a.config)}</span></a></th><td class="board-harness">${esc(a.harness_label)}</td><td class="board-bar">${bar(a)}</td><td class="num">${a.pair.mean.toFixed(3)}</td><td class="num">${(a.beat_rate * 100).toFixed(1)}%</td></tr>`).join('')}
        </tbody></table></div>
      <p class="section-note">Views: ${views.map(([id, label]) => `<a class="text-link" href="bench/#${id}">${label}</a>`).join(' &middot; ')}</p>`;
}

async function tarball() {
  const pin = source.release;
  const cached = join(root, '.cache/site', pin.sha256 + '.tar.gz');
  if (existsSync(cached)) {
    const raw = readFileSync(cached);
    if (raw.length === pin.bytes && sha(raw) === pin.sha256) return raw;
  }
  const response = await fetch(pin.url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Site release unavailable (HTTP ${response.status})`);
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length !== pin.bytes || sha(raw) !== pin.sha256) throw new Error('Site release bytes differ from the pin');
  mkdirSync(dirname(cached), { recursive: true });
  writeFileSync(cached, raw);
  return raw;
}

function untar(raw) {
  const tar = gunzipSync(raw), files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const name = field(0, 100);
    if (!name) break;
    const size = parseInt(field(124, 12).trim(), 8), type = field(156, 1) || '0';
    if (type !== '0' || field(345, 155) || !name.startsWith('results/') || name.split('/').some(p => !p || p === '.' || p === '..'))
      throw new Error('Unsafe site archive entry: ' + name);
    const path = name.slice('results/'.length);
    if (files.has(path)) throw new Error('Duplicate site archive entry: ' + name);
    files.set(path, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

export async function buildSite(flags = readFlags()) {
  const files = untar(await tarball());
  const expected = Object.keys(source.files).sort();
  if (JSON.stringify([...files.keys()].sort()) !== JSON.stringify(expected)) throw new Error('Site archive file set differs from the pin');
  for (const [path, body] of files) {
    const pin = source.files[path];
    if (body.length !== pin.bytes || sha(body) !== pin.sha256) throw new Error('Site file differs from the pin: ' + path);
  }
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const pages = tracked.filter(path => ALLOWED_FILES.includes(path) || ALLOWED_DIRS.some(dir => path.startsWith(dir)));
  for (const path of ALLOWED_FILES) if (!pages.includes(path)) throw new Error('Allowlisted page missing: ' + path);
  const stage = join(root, '_site.partial');
  rmSync(stage, { recursive: true, force: true });
  for (const [path, body] of files) {
    const target = join(stage, 'bench/results', path);
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body);
  }
  const marks = await import(pathToFileURL(join(stage, 'bench/results/logos.mjs')).href + '?pin=' + source.release.sha256);
  const blocks = { 'bench-preview': benchPreview(JSON.parse(files.get('data/leaderboard/view.json').toString('utf8')), marks, files.has('waffle.mjs')) };
  for (const path of pages) {
    mkdirSync(dirname(join(stage, path)), { recursive: true });
    if (path.endsWith('.html')) writeFileSync(join(stage, path), renderPage(readFileSync(join(root, path), 'utf8'), flags, blocks));
    else copyFileSync(join(root, path), join(stage, path));
  }
  rmSync(site, { recursive: true, force: true });
  renameSync(stage, site);
  return { pages: pages.length, results: files.size, flags };
}

const built = await buildSite();
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(built));
