// The Waffle view of the Bench: shipped with the pinned results bundle, linked from the Bench page and the
// overview, and consistent with the leaderboard data it is shown next to.
import { source } from '../scripts/site/build-site.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const site = new URL('../_site/', import.meta.url), results = new URL('bench/results/', site);
const text = (base, name) => readFileSync(new URL(name, base), 'utf8');
const view = JSON.parse(text(results, 'data/leaderboard/view.json'));
const W = await import(new URL('waffle.mjs', results));
const cases = W.decodeCases(JSON.parse(text(results, 'data/leaderboard/cases.json')), view);

test('the pinned bundle ships the view, its stylesheet and a small data file', () => {
  for (const file of ['waffle.mjs', 'waffle.css', 'data/leaderboard/cases.json']) assert(file in source.files, file);
  assert(source.files['data/leaderboard/cases.json'].bytes < 130000, 'Waffle data grew');
  assert(source.files['waffle.mjs'].bytes + source.files['waffle.css'].bytes < 60000);
  for (const file of ['waffle.mjs', 'waffle.css']) assert(!/https?:\/\/|@import|url\(/.test(text(results, file)), file + ' loads an external resource');
});

test('the Bench page loads it next to the other views and accepts ?view=waffle', () => {
  const page = text(site, 'bench/index.html'), app = text(results, 'app.mjs');
  assert(page.includes('href="results/waffle.css?'));
  assert(page.includes('<noscript>JavaScript is needed for interactive results.</noscript>'));
  const tabs = /const dashboardViews = [^\n]+/.exec(app)[0];
  assert.deepEqual([...tabs.matchAll(/<a href="#([a-z]+)/g)].map(m => m[1]), ['leaderboard', 'matrix', 'waffle', 'profiles', 'pareto', 'method']);
  assert(app.includes("path === 'waffle'") && app.includes("q.get('view')"));
  assert(text(site, 'index.html').includes('href="bench/#waffle"'));
});

test('rows, columns and the third dimension are those of the published release', () => {
  assert.equal(cases.agents.size, view.counts.agents);
  assert.equal(cases.problems.length, view.counts.problems);
  assert.deepEqual(W.FEATS, Object.keys(view.feature_labels));
  const order = W.problemOrder(cases.problems, view.items);
  assert.deepEqual([...new Set(order.map(p => p.dim))], [1, 2, 3, 4, 5]);
  assert.equal(order.length, view.counts.problems);
  assert.equal(W.CLASSES.length, 5);
});

test('the cells reproduce every case count of the leaderboard', () => {
  for (const a of view.agents) {
    let beats = 0;
    for (const f of W.FEATS) {
      const row = cases.agents.get(a.id)[f], n = { W: 0, L: 0, T: 0, M: 0 };
      row.faster.forEach((u, i) => n[W.caseCode(u, row.slower[i])]++);
      assert.deepEqual([n.W, n.L, n.T, n.M], [a.counts.beat[f], a.counts.loss[f], a.counts.tie[f], a.counts.mixed[f]], `${a.id} ${f}`);
      beats += n.W;
    }
    assert.equal(beats / view.counts.cases_per_agent, a.beat_rate, a.id);
  }
  for (const item of view.items) {
    const p = cases.problems.find(x => x.problem === item.problem);
    const beats = view.agents.reduce((s, a) => s + cases.agents.get(a.id)[item.feature].beats[p.index], 0);
    assert.equal(beats / item.runs, item.share, item.problem);
  }
});
