const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const label = 'Next evaluation for solvers. Next evaluation of agents.';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gz': 'application/gzip' };

async function main() {
  const output = process.env.SITE_TEST_ARTIFACTS || await fs.mkdtemp(path.join(os.tmpdir(), 'nexteval-site-'));
  await fs.mkdir(output, { recursive: true });
  let server;
  let browser;
  const faults = [];
  const results = [];
  try {
    let base = process.env.SITE_BASE_URL;
    if (!base) {
      server = http.createServer(async (req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        try {
          res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
          res.end(await fs.readFile(file));
        } catch { res.writeHead(404).end(); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      base = `http://127.0.0.1:${server.address().port}`;
    }
    browser = await chromium.launch({ headless: true, ...(process.env.SITE_BROWSER_CHANNEL ? { channel: process.env.SITE_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.on('pageerror', error => faults.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) faults.push(`${response.status()} ${response.url()}`); });
    for (const route of ['/', '/solver/', '/solver/api/', '/solver/guide/', '/bench/', '/bench/identity.html']) {
      for (const width of [320, 375, 390, 768, 1000, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        await page.goto(base + route, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const name = route === '/' ? 'overview' : route.includes('/api/') ? 'api' : route.includes('/guide/') ? 'guide' : route.includes('identity') ? 'brand' : route.split('/')[1];
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
        if (!['api', 'guide'].includes(name)) assert.equal(await page.locator('.evaluation-slogan').getAttribute('aria-label'), label);
        assert.equal(await page.locator('h1').filter({ visible: true }).count(), 1);
        assert.equal(await page.locator('.product-switcher a[href*="/api"]').count(), 0);
        assert.equal(await page.locator('.product-nav-band, .bench-nav-band').count(), 0);
        if (route.startsWith('/solver/')) {
          assert.equal((await page.locator('.product-switcher summary').textContent()).trim(), 'Solver');
          const solverNav = page.getByRole('navigation', { name: 'Solver navigation', exact: true, includeHidden: true });
          assert.equal(await solverNav.getByRole('link', { name: 'Python API', exact: true, includeHidden: true }).count(), 1);
          assert.equal(await solverNav.locator('[aria-current="page"]').textContent(), name === 'api' ? 'Python API' : name === 'guide' ? 'User Guide' : 'Overview');
        }
        const metrics = await page.evaluate(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          const slogan = document.querySelector('.evaluation-slogan');
          let wordInk;
          if (slogan) {
            const range = document.createRange();
            range.selectNodeContents(document.querySelector('.slogan-word'));
            wordInk = range.getBoundingClientRect();
          }
          const smallText = [];
          if (document.querySelector('.site-header')) {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const text = walker.currentNode;
              const parent = text.parentElement;
              if (!text.textContent.trim() || !parent.checkVisibility() || getComputedStyle(parent).visibility === 'hidden') continue;
              const size = parseFloat(getComputedStyle(parent).fontSize);
              if (size < 14) smallText.push({ text: text.textContent.trim().slice(0, 50), size });
            }
          }
          return {
            width: innerWidth, scroll: document.documentElement.scrollWidth,
            headerHeight: document.querySelector('.site-header')?.getBoundingClientRect().height,
            navOverflow: [...document.querySelectorAll('.site-header > a, .site-header summary')].some(link => {
              if (!link.checkVisibility()) return false;
              const r = link.getBoundingClientRect();
              return r.bottom > link.closest('.site-header').getBoundingClientRect().bottom + 1;
            }),
            hero: document.querySelector('.brand-hero') ? (() => {
              const field = document.querySelector('.hero-field');
              const content = document.querySelector('.hero-content');
              return {
                bounds: rect('.brand-hero'), field: rect('.hero-field'),
                decorative: field.getAttribute('aria-hidden') === 'true',
                noninteractive: getComputedStyle(field).pointerEvents === 'none',
                behindText: Number(getComputedStyle(field).zIndex) < Number(getComputedStyle(content).zIndex),
                captions: document.querySelectorAll('.brand-hero .visual-caption, .brand-hero .visual-status').length,
                linkReachable: [...content.querySelectorAll('a')].every(link => {
                  const r = link.getBoundingClientRect();
                  return link.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
                }),
              };
            })() : null,
            slogan: slogan ? rect('.evaluation-slogan') : null, endings: slogan ? rect('.slogan-meanings') : null,
            inkRight: wordInk?.right, smallText,
            images: [...document.images].every(image => image.complete && image.naturalWidth > 0),
            overflow: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'absolute').map(el => `${el.tagName}.${el.className}`).slice(0, 8),
          };
        });
        const prefix = `${name} ${width}`;
        if (metrics.scroll > width + 1) faults.push(`${prefix}: horizontal overflow ${JSON.stringify(metrics.overflow)}`);
        if (metrics.slogan && (metrics.slogan.right > width || metrics.inkRight > metrics.endings.x - 2)) faults.push(`${prefix}: slogan collision ${JSON.stringify(metrics)}`);
        if (metrics.smallText.length) faults.push(`${prefix}: text below 14px ${JSON.stringify(metrics.smallText)}`);
        if (metrics.navOverflow) faults.push(`${prefix}: navigation extends below its header`);
        if (metrics.headerHeight && metrics.headerHeight > 75) faults.push(`${prefix}: header wraps to multiple rows`);
        assert.equal(await page.locator('.header-mark').count(), 0);
        if (metrics.hero) {
          const hero = metrics.hero;
          if (!hero.decorative || !hero.noninteractive || !hero.behindText || hero.captions || !hero.linkReachable) faults.push(`${prefix}: invalid hero background layering ${JSON.stringify(hero)}`);
          if (hero.field.width < width || hero.field.y > metrics.slogan.y || hero.field.bottom < metrics.slogan.bottom) faults.push(`${prefix}: artwork does not span the hero`);
        }
        if (!metrics.images) faults.push(`${prefix}: image did not load`);
        const text = await page.locator('body').innerText();
        if (/One loop|Two public surfaces|THE OTHER SIDE OF THE LOOP/.test(text)) faults.push(`${prefix}: stale copy`);
        results.push({ page: name, width, scrollWidth: metrics.scroll, sloganWidth: metrics.slogan?.width });
        for (const switcher of await page.locator('.nav-switcher').all()) {
          await switcher.locator('summary').click();
          assert(await switcher.locator('nav').isVisible());
          const bounds = await switcher.locator('nav').boundingBox();
          assert(bounds.x >= 0 && bounds.x + bounds.width <= width, `${prefix}: dropdown overflow`);
          if (name === 'api' && [390, 1440].includes(width) && await switcher.locator('[data-current-view]').count()) {
            await page.screenshot({ path: path.join(output, `api-menu-${width}.png`) });
          }
          await page.keyboard.press('Escape');
          assert.equal(await switcher.getAttribute('open'), null);
          assert(await switcher.locator('summary').evaluate(el => el === document.activeElement));
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + '/solver/');
    await page.locator('.context-switcher summary').click();
    await page.getByRole('navigation', { name: 'Solver navigation', exact: true }).getByRole('link', { name: 'Python API', exact: true }).click();
    assert.match(page.url(), /\/solver\/api\/$/);
    assert.equal(await page.locator('h1').textContent(), 'Solver Python API');
    assert.equal(await page.locator('#model h2').textContent(), 'Model provider setup');
    assert.match(await page.locator('#model').textContent(), /separate from the Solver Python API/);
    for (const id of ['quick-start', 'model', 'solve', 'options', 'result', 'integration']) {
      assert.equal(await page.locator(`#${id}`).count(), 1);
    }
    for (const route of ['/solver/', '/solver/api/', '/solver/guide/']) {
      await page.goto(base + route);
      for (const snippet of await page.locator('pre[data-language="python"]').allTextContents()) {
        const checked = spawnSync('python3', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], { input: snippet, encoding: 'utf8' });
        assert.equal(checked.status, 0, checked.stderr || String(checked.error));
        if (!route.includes('/guide/')) assert.match(snippet, /"model": "env"/);
      }
    }
    const brokenLinks = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.querySelector(a.getAttribute('href'))).map(a => a.getAttribute('href')));
    assert.deepEqual(brokenLinks, []);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const firstCode = await page.locator('pre').first().textContent();
    await page.getByRole('button', { name: 'Copy Installation commands', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), firstCode);
    const example = await page.request.get(base + '/solver/guide/examples/optimize.py');
    assert.equal(example.status(), 200);
    assert.match(await example.text(), /def make_problem/);
    assert.equal((await page.request.get(base + '/solver/guide/validation.md')).status(), 200);
    await page.goto(base + '/bench/#profiles');
    await page.locator('#history-chart .chart-frame svg').waitFor({ timeout: 60000 });
    await page.locator('#profile-chart .chart-frame svg').waitFor({ timeout: 60000 });
    await page.getByRole('tab', { name: 'Data', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: 'Data', exact: true }).getAttribute('aria-selected'), 'true');
    await page.locator('#profile-chart .chart-frame svg').waitFor();
    await page.locator('#profile-chart').screenshot({ path: path.join(output, 'bench-data-profile.png') });
    await page.getByRole('tab', { name: 'Performance', exact: true }).click();
    await page.locator('#profile-chart .chart-frame svg').waitFor();
    await page.locator('#profile-chart').screenshot({ path: path.join(output, 'bench-performance-profile.png') });
    await page.goto(base + '/bench/#tasks');
    await page.locator('#configuration').waitFor();
    assert.equal(await page.locator('#task-badge').innerText(), 'ONE ORACLE INSTANCE');
    assert.equal(await page.locator('[data-current-view]').textContent(), 'Tasks');
    assert.equal(await page.getByRole('navigation', { name: 'Bench', exact: true, includeHidden: true }).getByRole('link', { name: /Task protocol/, includeHidden: true }).getAttribute('href'), 'https://github.com/NextEval/nexteval-bench/blob/main/docs/session-v1.md');
    await page.locator('.advanced summary').click();
    assert.equal(await page.getByLabel('Model provider authentication', { exact: true }).inputValue(), 'api_key');
    await page.getByRole('link', { name: 'Solver Python API', exact: true }).click();
    assert.match(page.url(), /\/solver\/api\/$/);
    // Keyboard opening, product switching, same-document views and browser history.
    await page.locator('.product-switcher summary').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Overview');
    await page.getByRole('navigation', { name: 'Products', exact: true }).getByRole('link', { name: 'Bench', exact: true }).click();
    assert.match(page.url(), /\/bench\/$/);
    await page.locator('.context-switcher summary').click();
    await page.getByRole('navigation', { name: 'Bench', exact: true }).getByRole('link', { name: 'Ranking', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-current-view]').textContent === 'Ranking');
    assert.equal(await page.locator('.context-switcher').getAttribute('open'), null);
    await page.locator('.context-switcher summary').click();
    await page.getByRole('navigation', { name: 'Bench', exact: true }).getByRole('link', { name: 'Tasks', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-current-view]').textContent === 'Tasks');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('[data-current-view]').textContent === 'Ranking');
    await page.locator('.context-switcher summary').click();
    await page.locator('h1:visible').click();
    assert.equal(await page.locator('.context-switcher').getAttribute('open'), null);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base, results, faults }, null, 2));
    console.log(JSON.stringify({ base, output, responsiveChecks: results.length, faults }, null, 2));
    assert.deepEqual(faults, []);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
