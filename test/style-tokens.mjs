// The overview and the Solver pages take their design language from the Bench results pages.
// site.css repeats the Bench values as --nx-* tokens; this test fails when the two drift apart.
import '../scripts/site/build-site.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../_site/' + name, import.meta.url), 'utf8');
const site = read('site.css'), bench = read('bench/results/results.css');
const norm = value => value.replace(/\s+/g, '').replace(/"/g, '').toLowerCase();
const token = name => norm(new RegExp(`--${name}:\\s*([^;]+);`).exec(site)?.[1] ?? '');
const benchVar = name => norm(new RegExp(`--result-${name}:\\s*([^;]+);`).exec(bench)?.[1] ?? '');
const benchRule = selector => new RegExp(selector.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(bench)?.[1] ?? '';
const prop = (rule, name) => norm(new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+)`).exec(rule)?.[1] ?? '');

test('colour and font tokens equal the Bench variables', () => {
  for (const [nx, result] of [['nx-bg', 'bg'], ['nx-surface', 'surface'], ['nx-line', 'line'], ['nx-text', 'text'], ['nx-muted', 'muted'], ['nx-accent', 'accent'], ['nx-mono', 'mono']]) {
    assert.notEqual(benchVar(result), '', result);
    assert.equal(token(nx), benchVar(result), nx);
  }
  const page = benchRule('.results-page');
  assert.equal(token('nx-sans'), prop(page, 'font-family'));
  assert.equal(token('nx-size-body'), prop(page, 'font-size'));
});

test('page width, padding and heading sizes equal the Bench results container', () => {
  const app = benchRule('#results-app');
  assert.equal(token('nx-page-width'), prop(app, 'max-width'));
  assert.equal(norm(/--nx-page-pad:\s*([^;]+);/.exec(site)[1]), prop(app, 'padding'));
  for (const [nx, selector] of [['nx-size-h1', '#results-app h1'], ['nx-size-h2', '#results-app h2'], ['nx-size-h3', '#results-app h3']])
    assert.equal(token(nx), prop(benchRule(selector), 'font-size'), nx);
  assert.equal(token('nx-size-small'), prop(benchRule('#results-app small'), 'font-size'));
});

test('components for the overview and the Solver pages use tokens, not new colours', () => {
  const components = site.slice(site.indexOf('/* ---------- 3. Page components'));
  assert(components.length > 1000);
  const benchCss = ['results.css', 'frontier.css', 'pair.css'].map(f => read('bench/results/' + f)).join('\n').toLowerCase();
  const literal = [...new Set([...components.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m => m[0].toLowerCase()))];
  assert(literal.length > 0 && literal.length < 12);
  for (const colour of literal) assert(benchCss.includes(colour), colour + ' is not a Bench colour');
  assert(!/@import|url\(/.test(site), 'no external resource in site.css');
});

test('Bench keeps its own stylesheets and the shared header rules', () => {
  const html = read('bench/index.html');
  assert(html.includes('class="results-page"') && !html.includes('site-page'));
  for (const sheet of ['../site.css', 'results/results.css', 'results/pair.css', 'results/frontier.css']) assert(html.includes(sheet), sheet);
  for (const rule of ['.site-header {', '.site-brand {', '.nav-switcher > summary {', '.switcher-panel {', '.header-source {']) assert(site.includes(rule), rule);
  // Every page component is scoped by a class the Bench markup does not use.
  const benchCode = ['app.mjs', 'frontier.mjs', 'pareto.mjs', 'chart.mjs'].map(f => read('bench/results/' + f)).join('\n') + html;
  for (const name of ['page', 'page-heading', 'page-tabs', 'page-footer', 'section', 'card', 'facts', 'data-table', 'docs-layout', 'prose', 'button', 'badge', 'callout', 'figure'])
    assert(!new RegExp(`class="(?:[^"]* )?${name}(?: [^"]*)?"`).test(benchCode), name);
});
