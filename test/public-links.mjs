// Published pages may link only to NextEval repositories that anonymous visitors can open.
import '../scripts/site/build-site.mjs';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_REPOS = Object.freeze(['nexteval.github.io']);
const site = fileURLToPath(new URL('../_site/', import.meta.url));
const pages = (await readdir(site, { recursive: true })).filter(path => path.endsWith('.html')).sort();
assert(pages.length > 0, 'No built pages');
const blocked = [];
for (const page of pages) {
  (await readFile(join(site, page), 'utf8')).split('\n').forEach((line, i) => {
    for (const [, url] of line.matchAll(/\b(?:href|src|action)\s*=\s*["']?([^"'\s>]+)/gi)) {
      const repo = url.match(/^(?:https?:)?\/\/(?:www\.)?github\.com\/NextEval\/([^/?#]+)/i)?.[1].replace(/\.git$/i, '').toLowerCase();
      if (repo && !PUBLIC_REPOS.includes(repo)) blocked.push(`${page}:${i + 1} ${url}`);
    }
  });
}
assert.deepEqual(blocked, [], 'Links to NextEval repositories that are not public');
console.log(JSON.stringify({ pages: pages.length, public_repos: PUBLIC_REPOS }));
