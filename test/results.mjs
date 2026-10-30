import './terminology.mjs';
import './current-presentation.mjs';
import './primary-archive-entry.mjs';
import './bootstrap-imports.mjs';
import { source, ALLOWED_FILES, ALLOWED_DIRS } from '../scripts/site/build-site.mjs';
import { checkSite } from '../scripts/site/site-check.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = join(root, '_site');
assert.equal(source.schema, 'nexteval.site-source/1');
assert.equal(source.source_repository, 'NextEval/nexteval-bench-website');
async function allFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink());
    if (entry.isDirectory()) files.push(...(await allFiles(join(dir, entry.name))).map(p => entry.name + '/' + p));
    else files.push(entry.name);
  }
  return files.sort();
}
for (const [file, pin] of Object.entries(source.files)) {
  assert(!file.startsWith('/') && !file.split('/').includes('..'));
  const bytes = await readFile(join(site, 'bench/results', file));
  assert.equal(bytes.length, pin.bytes, `Unsynchronized result file: ${file}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256, `Unsynchronized result file: ${file}`);
}
assert.deepEqual(await allFiles(join(site, 'bench/results')), Object.keys(source.files).sort(), 'Unexpected result file');

const published = await allFiles(site);
for (const path of published) assert(ALLOWED_FILES.includes(path) || ALLOWED_DIRS.some(dir => path.startsWith(dir)) || path.startsWith('bench/results/'), 'Unexpected published file: ' + path);
for (const removed of ['scripts/', 'test/', 'audit/', 'README.md', 'bench/results-source.json', 'bench/app.js', 'bench/identity.html',
  'bench/assets/comparisons/', 'bench/assets/curves/', 'bench/assets/catalog/', 'bench/assets/provenance.json', 'bench/assets/gpt-performance.pdf',
  'bench/results/archive/', 'bench/results/usage-estimates.html', 'bench/results/check.mjs', 'bench/results/evidence.mjs',
  'bench/results/data/evidence/', 'bench/results/data/historical-assisted/', 'bench/results/data/pricing-snapshot.json'])
  assert(!published.some(path => path === removed || path.startsWith(removed)), 'Removed file is still published: ' + removed);
for (const page of ['index.html', 'bench/index.html', 'bench/archive.html', 'bench/ten-repeat.html', 'bench/results/index.html']) {
  const text = await readFile(join(site, page), 'utf8');
  for (const pattern of [/download/i, /evidence/i, /provenance/i, /nexteval-bench-data/, /github\.com\/NextEval\/nexteval-bench"/, /usage-estimates/])
    assert(!pattern.test(text), `${page} ${pattern}`);
}
console.log(JSON.stringify({ published: published.length, ...(await checkSite(join(site, 'bench/results'))) }));
