const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
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
    for (const route of ['/', '/solver/', '/bench/', '/bench/identity.html']) {
      for (const width of [320, 375, 390, 768, 1000, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        await page.goto(base + route, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const name = route === '/' ? 'overview' : route.includes('identity') ? 'brand' : route.split('/')[1];
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
        assert.equal(await page.locator('.evaluation-slogan').getAttribute('aria-label'), label);
        assert.equal(await page.locator('h1').filter({ visible: true }).count(), 1);
        const metrics = await page.evaluate(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('.slogan-word'));
          const wordInk = range.getBoundingClientRect();
          return {
            width: innerWidth, scroll: document.documentElement.scrollWidth,
            artwork: document.querySelector('.brand-hero .hero-visual') ? rect('.brand-hero .hero-visual') : null,
            slogan: rect('.evaluation-slogan'), word: rect('.slogan-word'), endings: rect('.slogan-meanings'),
            inkRight: wordInk.right,
            images: [...document.images].every(image => image.complete && image.naturalWidth > 0),
            overflow: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'absolute').map(el => `${el.tagName}.${el.className}`).slice(0, 8),
          };
        });
        const prefix = `${name} ${width}`;
        if (metrics.scroll > width + 1) faults.push(`${prefix}: horizontal overflow ${JSON.stringify(metrics.overflow)}`);
        if (metrics.slogan.right > width || metrics.inkRight > metrics.endings.x - 2) faults.push(`${prefix}: slogan collision ${JSON.stringify(metrics)}`);
        if (metrics.artwork && metrics.slogan.right > metrics.artwork.x && metrics.slogan.bottom > metrics.artwork.y && metrics.slogan.y < metrics.artwork.bottom) faults.push(`${prefix}: slogan overlaps artwork`);
        if (!metrics.images) faults.push(`${prefix}: image did not load`);
        const text = await page.locator('body').innerText();
        if (/One loop|Two public surfaces|THE OTHER SIDE OF THE LOOP/.test(text)) faults.push(`${prefix}: stale copy`);
        results.push({ page: name, width, scrollWidth: metrics.scroll, sloganWidth: metrics.slogan.width });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
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
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base, results, faults }, null, 2));
    console.log(JSON.stringify({ base, output, responsiveChecks: results.length, faults }, null, 2));
    assert.deepEqual(faults, []);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
