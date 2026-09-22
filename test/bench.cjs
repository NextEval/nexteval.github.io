const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gz': 'application/gzip' };

async function main() {
  const output = process.env.SITE_TEST_ARTIFACTS || await fs.mkdtemp(path.join(os.tmpdir(), 'nexteval-bench-'));
  await fs.mkdir(output, { recursive: true });
  let server, browser;
  const faults = [], results = [];
  try {
    let base = process.env.SITE_BASE_URL;
    if (!base) {
      server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
        catch { res.writeHead(404).end(); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      base = `http://127.0.0.1:${server.address().port}`;
    }
    browser = await chromium.launch({ headless: true, channel: process.env.SITE_BROWSER_CHANNEL || 'chrome' });
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.on('pageerror', e => faults.push(e.message));
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) faults.push(`${r.status()} ${r.url()}`); });
    const waitForResults = async () => {
      await page.waitForFunction(() => document.querySelector('#comparison-status').textContent === 'Applied comparison', undefined, { timeout: 60000 });
    };
    // Same-document links must load the requested evidence, not just relabel a control.
    await page.goto(`${base}/bench/#profiles?feature=perturbed_x0`, { waitUntil: 'networkidle' });
    await waitForResults();
    const initialComparison = await page.locator('#profile-data').getAttribute('href');
    await page.goto(`${base}/bench/#profiles?feature=perturbed_x0%2Bnoisy&study=combined-noisy`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#study').value === 'combined-noisy', undefined, { timeout: 5000 });
    await waitForResults();
    assert.notEqual(await page.locator('#profile-data').getAttribute('href'), initialComparison);
    assert.equal(await page.locator('#score-rows tr').count(), 12);
    // Reset the document before the independent responsive snapshots.
    await page.goto('about:blank');
    for (const view of ['home', 'ranking', 'profiles', 'tasks']) {
      for (const width of [320, 390, 768, 1280, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/bench/#${view}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        if (['ranking', 'profiles'].includes(view)) await waitForResults();
        if (view === 'profiles') await page.locator('#history-chart .chart-frame svg').waitFor();
        assert.equal(await page.locator('h1:visible').count(), 1);
        assert.equal(await page.locator('.context-switcher [aria-current="page"]').getAttribute('data-route'), view);
        assert.equal((await page.locator('[data-current-view]').textContent()).toLowerCase(), view);
        const layout = await page.evaluate(() => {
          const small = [], clippedTicks = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode, el = node.parentElement;
            if (!node.textContent.trim() || !el.checkVisibility() || el.closest('math, script, style, title, option')) continue;
            if (parseFloat(getComputedStyle(el).fontSize) < 14) small.push(node.textContent.trim().slice(0, 60));
          }
          for (const el of document.querySelectorAll('.chart-tick')) {
            if (!el.checkVisibility()) continue;
            const r = el.getBoundingClientRect(), frame = el.closest('svg').getBoundingClientRect();
            if (r.left < frame.left - 1 || r.right > frame.right + 1) clippedTicks.push(el.textContent);
          }
          return { width: innerWidth, scroll: document.documentElement.scrollWidth, small, clippedTicks,
            images: [...document.images].every(i => i.complete && i.naturalWidth > 0),
            font: getComputedStyle(document.body).fontFamily,
          };
        });
        if (layout.scroll > width || layout.small.length || layout.clippedTicks.length || !layout.images) faults.push({ view, ...layout });
        assert.match(layout.font, /Avenir Next/);
        await page.screenshot({ path: path.join(output, `${view}-${width}.png`), fullPage: true });
        if (view === 'profiles') await page.locator('#profile-chart').screenshot({ path: path.join(output, `profile-chart-${width}.png`) });
        results.push({ view, ...layout });
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const feature of ['perturbed_x0', 'perturbed_x0+noisy']) {
      await page.goto(`${base}/bench/#profiles?feature=${encodeURIComponent(feature)}`, { waitUntil: 'networkidle' });
      await waitForResults();
      await page.locator('#history-chart .chart-frame svg').waitFor();
      assert.equal(await page.locator('#archive-feature').inputValue(), feature);
      const download = await page.locator('#profile-data').getAttribute('href');
      const scores = await page.locator('#score-rows').textContent();
      const key = page.locator('#profile-chart .series-key').first();
      await key.click();
      assert.equal(await key.getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#profile-data').getAttribute('href'), download);
      assert.equal(await page.locator('#score-rows').textContent(), scores);
      await key.click();
      for (const kind of ['performance', 'data']) {
        await page.locator(`[data-plot="${kind}"]`).click();
        assert.equal(await page.locator(`[data-plot="${kind}"]`).getAttribute('aria-selected'), 'true');
        const styles = await page.locator('#profile-chart').evaluate(host => {
          const keys = [...host.querySelectorAll('.series-swatch line')];
          const lines = [...host.querySelectorAll('.chart-frame g[clip-path] > path[stroke]')];
          return keys.map((key, i) => ({
            color: key.getAttribute('stroke') === lines[i]?.getAttribute('stroke'),
            dash: (key.getAttribute('stroke-dasharray') === 'none' ? '' : key.getAttribute('stroke-dasharray')) === lines[i]?.getAttribute('stroke-dasharray'),
            marker: !!key.parentElement.querySelector('circle'),
          }));
        });
        assert(styles.length >= 2 && styles.every(s => s.color && s.dash && s.marker));
        await page.locator('#profile-chart').screenshot({ path: path.join(output, `${feature}-${kind}.png`) });
      }
      if (!(await page.locator('.comparison-picker').evaluate(el => el.open))) await page.locator('.comparison-picker summary').click();
      const selected = page.locator('#comparison-solvers input:checked');
      const count = await selected.count();
      assert(count > 2);
      await selected.last().uncheck();
      assert.match(await page.locator('#comparison-status').textContent(), /Pending selection/);
      assert.equal(await page.locator('#profile-data').getAttribute('href'), download);
      await page.locator('#comparison-apply').click();
      await waitForResults();
      assert.notEqual(await page.locator('#profile-data').getAttribute('href'), download);
      assert.equal(await page.locator('#score-rows tr').count(), count - 1);
      await page.locator('#comparison-default').click();
      await page.locator('#comparison-apply').click();
      await waitForResults();
      assert.equal(await page.locator('#profile-data').getAttribute('href'), download);
      await page.locator('#history-run').selectOption('2');
      assert.match(await page.locator('#history-caption').textContent(), /repetition 2/);
      await page.locator('#history-chart .chart-frame svg').focus();
      await page.keyboard.press('ArrowRight');
      assert(await page.locator('#history-chart .chart-tooltip').isVisible());
    }

    await page.goto(`${base}/bench/#profiles?feature=perturbed_x0%2Bnoisy&study=combined-noisy`, { waitUntil: 'networkidle' });
    await waitForResults();
    const scopes = await page.locator('#study option').evaluateAll(options => options.map(o => o.value));
    for (const scope of scopes) {
      await page.locator('#study').selectOption(scope);
      await waitForResults();
      assert(await page.locator('#profile-chart .series-key').count() >= 2);
    }
    await page.locator('#study').selectOption('combined-noisy');
    await waitForResults();
    if (!(await page.locator('.comparison-picker').evaluate(el => el.open))) await page.locator('.comparison-picker summary').click();
    const historyPicker = page.locator('#problem-histories .participant-picker');
    if (!(await historyPicker.evaluate(el => el.open))) await historyPicker.locator('summary').click();
    const participantNames = await page.locator('#history-participants input').evaluateAll(inputs => inputs.map(i => i.value));
    for (const name of participantNames) await historyPicker.getByRole('checkbox', { name, exact: true }).check();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#history-chart .chart-frame svg').waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#history-chart').screenshot({ path: path.join(output, `all-histories-${width}.png`) });
      await page.locator('#profile-chart').screenshot({ path: path.join(output, `all-models-${width}.png`) });
    }
    const currentUrl = page.url();
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    assert.equal(page.url(), currentUrl);
    assert.equal(await page.locator('#profiles').isVisible(), true);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/bench/#tasks`, { waitUntil: 'networkidle' });
    await page.locator('[data-mode="suite"]').click();
    assert.equal(await page.locator('#metric-3').textContent(), '276');
    await page.locator('#feature').selectOption('perturbed_x0+noisy');
    assert(await page.locator('#noise-field').isVisible());
    assert(await page.locator('#perturb-field').isVisible());
    await page.locator('#harness').selectOption('codex');
    assert.equal(await page.locator('#model').inputValue(), 'openai/gpt-5.6-sol');
    await page.locator('#budget').fill('0');
    assert(await page.locator('#form-error').isVisible());
    assert(await page.locator('#download-task').isDisabled());
    await page.locator('#budget').fill('50');
    assert(!(await page.locator('#form-error').isVisible()));
    const taskJson = JSON.parse(await page.locator('#json-preview').textContent());
    assert.equal(taskJson.schema, 'nexteval-bench.function-suite/1');
    assert.equal(taskJson.features.length, 2);
    assert.equal(taskJson.budget.evaluations.factor, 50);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-task').click();
    const taskFile = await downloadPromise;
    assert.deepEqual(JSON.parse(await fs.readFile(await taskFile.path(), 'utf8')), taskJson);
    await page.locator('.command-details summary').click();
    await page.locator('.json-details summary').click();
    await page.screenshot({ path: path.join(output, 'task-suite-expanded.png'), fullPage: true });
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base, results, faults }, null, 2));
    console.log(JSON.stringify({ base, output, responsiveChecks: results.length, faults }, null, 2));
    assert.deepEqual(faults, []);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
