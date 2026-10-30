// Builds _site/: the allowlisted public pages plus the pinned slim results bundle.
// Only files tracked by Git under the allowlist and the verified release tarball are published.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const ALLOWED_FILES = Object.freeze(['index.html', 'site.css', 'site.js', 'slogan.css', 'navigation.js',
  'bench/index.html', 'bench/archive.html', 'bench/ten-repeat.html']);
export const ALLOWED_DIRS = Object.freeze(['solver/', 'site-assets/', 'bench/vendor/', 'bench/assets/brand/']);
export const source = JSON.parse(readFileSync(join(root, 'bench/results-source.json'), 'utf8'));
const site = join(root, '_site');
const sha = raw => createHash('sha256').update(raw).digest('hex');

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

export async function buildSite() {
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
  for (const path of pages) { mkdirSync(dirname(join(stage, path)), { recursive: true }); copyFileSync(join(root, path), join(stage, path)); }
  for (const [path, body] of files) {
    const target = join(stage, 'bench/results', path);
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body);
  }
  rmSync(site, { recursive: true, force: true });
  renameSync(stage, site);
  return { pages: pages.length, results: files.size };
}

const built = await buildSite();
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(built));
