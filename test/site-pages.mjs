// The overview and the Solver pages: one navigation and one footer, the final solver only, build flags,
// a static Bench preview that equals the pinned data, public wording, and static content without JavaScript.
import { source, readFlags, renderPage, FLAG_NAMES, PREVIEW_ROWS } from '../scripts/site/build-site.mjs';
import { notPublic } from '../scripts/site/site-check.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url)), site = join(root, '_site');
const built = name => readFileSync(join(site, name), 'utf8');
const sourcePage = name => readFileSync(join(root, name), 'utf8');
const PAGES = ['index.html', 'solver/index.html', 'solver/guide/index.html', 'solver/api/index.html'];
const SOLVER = PAGES.slice(1);
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
const links = html => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(m => m[1]);
const flags = readFlags();

test('every page has the shared header, one h1, a skip link, a main landmark and the shared footer', () => {
  for (const page of PAGES) {
    const html = built(page);
    assert(/<body class="site-page">/.test(html), page);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, page);
    assert(html.includes('<a class="site-skip" href="#content">') && html.includes('<main class="page" id="content" tabindex="-1">'), page);
    assert.equal((html.match(/<header class="site-header"/g) || []).length, 1, page);
    assert.equal((html.match(/<footer class="page-footer">/g) || []).length, 1, page);
    const products = /<nav class="switcher-panel" aria-label="Products">([\s\S]*?)<\/nav>/.exec(html)[1];
    assert.deepEqual([...products.matchAll(/>([A-Za-z ]+?)\s*(?:<svg|<\/a>)/g)].map(m => m[1].trim()), ['Overview', 'Bench', 'Solver', 'GitHub'], page);
    assert.equal((html.match(/aria-current="page"/g) || []).length, page === 'index.html' ? 1 : 2, page);   // header, and the page tabs on Solver pages
  }
  // Bench uses the same product navigation.
  const bench = /<nav class="switcher-panel" aria-label="Products">([\s\S]*?)<\/nav>/.exec(built('bench/index.html'))[1];
  assert.deepEqual([...bench.matchAll(/<a\b[^>]*>([A-Za-z ]+)/g)].map(m => m[1].trim()), ['Overview', 'Bench', 'Solver', 'GitHub']);
  for (const page of SOLVER) {
    const html = built(page);
    const context = /<nav class="switcher-panel" aria-label="Solver navigation">([\s\S]*?)<\/nav>/.exec(html)[1];
    const tabs = /<nav class="page-tabs" aria-label="Solver pages">([\s\S]*?)<\/nav>/.exec(html)[1];
    for (const block of [context, tabs]) assert.deepEqual([...block.matchAll(/(?:<\/svg>|">)(Overview|User Guide|Python API)<\/a>/g)].map(m => m[1]), ['Overview', 'User Guide', 'Python API'], page);
  }
});

test('wherever the two products are listed together, Bench comes first and Solver second', () => {
  const position = (html, pattern) => { const at = html.search(pattern); assert(at >= 0, String(pattern)); return at; };
  const benchLink = /<a\b[^>]*>Bench</, solverLink = /<a\b[^>]*>Solver</;
  for (const page of [...PAGES, 'bench/index.html']) {
    const html = built(page);
    const menu = /<nav class="switcher-panel" aria-label="Products">([\s\S]*?)<\/nav>/.exec(html)[1];
    assert(position(menu, benchLink) < position(menu, solverLink), page + ' product menu');
    const footer = /<footer class="page-footer">([\s\S]*?)<\/footer>/.exec(html)?.[1];
    if (footer && solverLink.test(footer)) assert(position(footer, benchLink) < position(footer, solverLink), page + ' footer');
    if (footer) assert(position(footer, benchLink) < position(footer, /(Solver|User Guide|Python API)</), page + ' footer starts with Bench');
  }
  const home = built('index.html');
  assert(position(home, /data-product="bench"/) < position(home, /data-product="solver"/), 'overview cards');
  const head = home.slice(0, home.indexOf('</head>'));
  for (const field of [/<title>([^<]*)<\/title>/, /<meta name="description" content="([^"]*)"/]) {
    const value = field.exec(head)[1];
    assert(value.indexOf('Bench') >= 0 && value.indexOf('Bench') < value.indexOf('Solver'), value);
  }
  const lede = /<h1>NextEval<\/h1>\s*<p>([^<]*)<\/p>/.exec(home)[1];
  assert(lede.indexOf('benchmark') >= 0 && lede.indexOf('benchmark') < lede.indexOf('solver'), lede);
  // The link list keeps the order in both flag states.
  for (const released of [false, true]) {
    const list = /<dl class="def-list">([\s\S]*?)<\/dl>/.exec(renderPage(sourcePage('index.html'), { SOLVER_RELEASED: released }))[1];
    const terms = [...list.matchAll(/<dt>([^<]+)<\/dt>/g)].map(m => m[1]);
    assert.deepEqual(terms, released ? ['Code', 'Results', 'Solver', 'Website'] : ['Code', 'Results', 'Website']);
  }
});

test('local links resolve to built files and fragments', () => {
  for (const page of PAGES) {
    const html = built(page), dir = page.includes('/') ? page.slice(0, page.lastIndexOf('/') + 1) : '';
    for (const href of [...links(html), ...[...html.matchAll(/<(?:link|script|img)\b[^>]*\b(?:href|src)="([^"]+)"/g)].map(m => m[1])]) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [path, fragment] = href.split('#');
      const clean = path.split('?')[0];
      const target = new URL(clean || '.', 'https://site.invalid/' + dir).pathname.slice(1);
      const file = clean === '' ? page : target.endsWith('/') || target === '' ? target + 'index.html' : target;
      let body;
      assert.doesNotThrow(() => { body = readFileSync(join(site, file), 'utf8'); }, `${page} -> ${href}`);
      if (fragment && file.endsWith('.html') && !file.startsWith('bench/')) assert(body.includes(`id="${fragment}"`), `${page} -> ${href}`);
    }
  }
});

// Words and word pairs that do not belong on pages about the software, as sha256 of their lower-case text
// (the scheme of the site guard in site-check.mjs).
const OFF_TOPIC_SHA256 = new Set([
  "16f225c044affe557741097deb6226c729794f9adbd4bd7ff2e22dafb6e80c85", "21e945ad5e3b81adf2ac82114f7e701ca858a81c9b678ea7d23f95927b71d424",
  "293f1d2ee206a7cbebe633764a26ea455bd39f494a774a7289f8663da31916a2", "382635c9325bf3273d195ff1b8a44e5b11afd7d97addeb8863ea35feb98c1a07",
  "4de79b082f4fe901e33c3c1cc870e3a802bcd8600489a974c1e3851fc4682795", "8bddf4c0f769a0125ce2a2a0c6464bbd8fb9a679acc1ace032a7d08b0c7a5b5b",
  "bc318ecbb352a373dd0df388a74b39c039468b85ca8cf2f46b7e8138f86c5b78", "d7f0699b28d235a6275fa3a1ad8a696fcf7348680d31eb3d3538b92b878c3483",
  "e2768108bb5fbd628f4082537a56c15de829726693492d7d37df8f0bcebc95b8", "e622da235a56977383e1db8bfe71eaa9b6156cec5cd95df9dc4d2aa3ac5d267a",
  "f41de36c6f4ac501064849b08eb257c7f0af4e9a886aefe91ddd6bd575787830", "fca7737c30a10e780333b54ce25265e5a55b371116144f32b2da70ca1da7da89",
]);
const sha256 = value => createHash('sha256').update(value).digest('hex');
// The first such word of a text as 'word <index>' (never the word itself), or null.
const offTopic = plain => {
  const words = plain.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (let i = 0; i < words.length; i++)
    if (OFF_TOPIC_SHA256.has(sha256(words[i])) || (i + 1 < words.length && OFF_TOPIC_SHA256.has(sha256(words[i] + ' ' + words[i + 1])))) return 'word ' + i;
  return null;
};

test('the Solver section presents the final solver only', () => {
  for (const page of SOLVER) {
    const html = built(page), plain = text(html);
    assert(plain.includes('NextEval Solver 1.0'), page);
    for (const old of [/core-v\d/i, /execution_mode/, /stepwise/i, /\bv0\.\d/, /cb58fd7/, /\brc\d\b/i, /release candidate/i, /codename/i, /\bpreview\b(?! model)/i, /policy\.decide/, /advisor/])
      assert(!old.test(plain.replace(/preview_model|model preview/g, '')), `${page} ${old}`);
    // No results of the solver: the pages describe the software.
    for (const word of [/\bexperiments?\b/i, /outperform/i, /state[- ]of[- ]the[- ]art/i, /\bvs\.? COBYQA\b/i])
      assert(!word.test(plain), `${page} ${word}`);
    assert.equal(offTopic(plain), null, page);
  }
  const landing = text(built('solver/index.html'));
  for (const part of ['What it is', 'Quick start', 'The tool surface', 'Runners', 'Configuration', 'API reference', 'Built-in runner', 'Codex adapter', 'Claude Code adapter', 'shared decision space', 'textbook autopilot'])
    assert(landing.toLowerCase().includes(part.toLowerCase()), part);
  assert(/<svg class="figure-wide"[^>]*role="img" aria-label="Architecture/.test(built('solver/index.html')));
});

test('SOLVER_RELEASED chooses between the release items and "coming soon"', () => {
  assert.deepEqual(FLAG_NAMES, ['SOLVER_RELEASED']);
  assert.equal(typeof flags.SOLVER_RELEASED, 'boolean');
  const RELEASE_ITEMS = [/pip install "?nexteval-solver/, /github\.com\/NextEval\/nexteval-solver/, /v1\.0\.0|Release <b>1\.0\.0<\/b>|Release 1\.0\.0/];
  for (const page of PAGES) {
    const raw = sourcePage(page);
    assert(raw.includes('<!--@if SOLVER_RELEASED-->'), page);
    const before = renderPage(raw, { SOLVER_RELEASED: false }), after = renderPage(raw, { SOLVER_RELEASED: true });
    for (const html of [before, after]) assert(!html.includes('<!--@if') && !html.includes('<!--@else') && !html.includes('<!--@endif'), page);
    for (const item of RELEASE_ITEMS) assert(!item.test(before), `${page} shows ${item} before the release`);
    assert(before.includes('Release: coming soon') && !after.includes('coming soon'), page);
    assert(RELEASE_ITEMS[2].test(after), page);
    assert.equal(built(page).includes('Release: coming soon'), !flags.SOLVER_RELEASED, page);
  }
  for (const page of SOLVER) for (const item of RELEASE_ITEMS.slice(0, 2)) assert(item.test(renderPage(sourcePage(page), { SOLVER_RELEASED: true })) || page === 'solver/guide/index.html' || item === RELEASE_ITEMS[0], `${page} ${item}`);
  const landing = renderPage(sourcePage('solver/index.html'), { SOLVER_RELEASED: true });
  assert(landing.includes('python -m pip install nexteval-solver') && landing.includes('https://github.com/NextEval/nexteval-solver'));
  assert.throws(() => renderPage('<!--@if UNKNOWN-->x<!--@endif-->', flags), /Unknown build flag/);
  assert.throws(() => readFlags({ SOLVER_RELEASED: 'maybe' }), /true or false/);
  assert.equal(readFlags({ SOLVER_RELEASED: 'true' }).SOLVER_RELEASED, true);
});

test('the overview states what NextEval is, links both products and shows the pinned leaderboard', () => {
  const html = built('index.html'), plain = text(html);
  assert(/NextEval is an open research project on derivative-free optimization/.test(plain));
  for (const [product, href] of [['bench', 'bench/'], ['solver', 'solver/']]) assert(new RegExp(`<a class="card card-entry" data-product="${product}" href="${href}">`).test(html));
  const view = JSON.parse(built('bench/results/data/leaderboard/view.json'));
  const rows = [...html.matchAll(/<tr><td class="rank">(\d+)<\/td><th scope="row"><a class="board-who" href="bench\/#agent\/([^"]+)">[\s\S]*?<span>([^<]+)<\/span><\/a><\/th><td class="board-harness">([^<]+)<\/td>[\s\S]*?<td class="num">([\d.]+)<\/td><td class="num">([\d.]+)%<\/td><\/tr>/g)];
  assert.equal(PREVIEW_ROWS, 6);
  assert.equal(rows.length, PREVIEW_ROWS);
  assert(plain.includes(`First six of ${view.counts.agents} agents`) && html.includes('<caption>First six agents of the NextEval Bench leaderboard</caption>'));
  assert(!/First five/i.test(html));
  rows.forEach((row, i) => {
    const a = view.agents[i];
    assert.deepEqual(row.slice(1), [String(i + 1), encodeURIComponent(a.id), a.config, a.harness_label, a.pair.mean.toFixed(3), (a.beat_rate * 100).toFixed(1)]);
  });
  assert(plain.includes(`${view.counts.agents} agents`) && plain.includes(`${view.counts.problems} problems`) && plain.includes(view.counts.cases_per_agent.toLocaleString('en-US')));
  assert(plain.includes(view.last_updated));
  assert.equal(html.includes('href="bench/#waffle"'), 'waffle.mjs' in source.files);
  // Outside links: the same two public addresses the site already published, nothing else.
  const external = [...new Set(links(html).filter(h => /^https?:/.test(h)))].sort();
  assert.deepEqual(external, ['https://github.com/NextEval', 'https://github.com/NextEval/nexteval.github.io', ...(flags.SOLVER_RELEASED ? ['https://github.com/NextEval/nexteval-solver'] : [])].sort());
});

test('pages need no script for their content, load nothing from other hosts and carry text alternatives', () => {
  for (const page of PAGES) {
    const html = built(page);
    for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) assert(!/^(https?:)?\/\//.test(m[1]), `${page} loads ${m[1]}`);
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), page + ' has an inline script');
    for (const m of html.matchAll(/<script\b[^>]*>/g)) assert(/\bdefer\b/.test(m[0]), page);
    for (const m of html.matchAll(/<img\b[^>]*>/g)) assert(/\balt="/.test(m[0]) && /\bwidth="\d+"/.test(m[0]) && /\bheight="\d+"/.test(m[0]), `${page} ${m[0]}`);
    for (const m of html.matchAll(/<svg\b[^>]*>/g)) assert(/aria-hidden="true"/.test(m[0]) || (/role="img"/.test(m[0]) && /aria-label="/.test(m[0])), `${page} ${m[0].slice(0, 80)}`);
    for (const m of html.matchAll(/<table\b[\s\S]*?<\/table>/g)) assert(/<caption>/.test(m[0]) && /<th[^>]*scope="col"/.test(m[0]), page + ' table');
    assert(!/\p{Extended_Pictographic}/u.test(html.replace(/&copy;|©/g, '')), page + ' has a pictograph');
    assert(text(html).length > 600, page);
  }
  assert(!built('solver/docs.js').includes('lucide') && !PAGES.some(page => built(page).includes('lucide')), 'icons are inline');
});

test('public wording: the internal-word guard passes on every published text file outside the results bundle', () => {
  const files = readdirSync(site, { recursive: true }).map(String).filter(f => /\.(html|css|js|mjs|md|py|json|svg)$/.test(f) && !f.startsWith('bench/results/') && !f.startsWith('bench/vendor/'));
  assert(files.length >= 10);
  for (const file of files) built(file).split('\n').forEach((line, i) => assert.equal(notPublic(line), null, `${file}:${i + 1}`));
  for (const page of PAGES) for (const pattern of [/\/Users\/|\/home\/|C:\\\\/, /localhost|127\.0\.0\.1/, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}\b/]) assert(!pattern.test(built(page)), `${page} ${pattern}`);
});
