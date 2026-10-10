import assert from 'node:assert/strict';
import { readFile, access, mkdtemp, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const html = await readFile(join(root, 'bench/run/index.html'), 'utf8');
const decode = value => value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"');
const blocks = new Map([...html.matchAll(/<pre data-step="([^"]+)"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(([, step, code]) => [step, decode(code)]));
const section = id => html.match(new RegExp(`<section id="${id}">([\\s\\S]*?)<\\/section>`))?.[1] || '';

test('reuses shared docs assets and Bench navigation without changing other pages', async () => {
  assert.match(html, /class="api-page guide-page"/);
  assert.match(html, /data-product="bench"/);
  assert.match(html, /<summary>Bench /);
  assert.match(html, /<a href="\.\/" aria-current="page">Run locally<\/a>/);
  assert.match(html, /<h1>Run locally<\/h1>/);
  for (const asset of ['../../site.css', '../../solver/docs.js', '../../navigation.js', '../vendor/lucide.min.js']) {
    assert(html.includes(`"${asset}`), asset);
    await access(resolve(root, 'bench/run', asset));
  }
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert(html.includes(`id="${id}"`), id);
  assert.doesNotMatch(html, /<style|<script(?![^>]*\bsrc=)|<form|\bonclick=|fetch\(/);
});

test('installation remains source-pinned and explicitly pre-release', () => {
  assert.match(blocks.get('install'), /git checkout --detach 8dca62ccc550031517094a985ad4af0830bac6d8/);
  assert.doesNotMatch(html, /REPLACE_WITH_REVIEWED_COMMIT/);
  assert.match(section('status'), /release approval and genuine native CLI\/provider acceptance remain pending/);
  assert.match(html, /Python 3\.12 or newer/);
  assert.match(section('status'), /Pre-release candidate, not provider-certified or genuine-CLI-certified/);
  assert.match(section('status'), /not a PyPI release/);
  assert.doesNotMatch(blocks.get('install'), /nexteval-bench (smoke|run)\b|git checkout.*\b(main|latest)\b/);
});

test('all copied Bash blocks parse without running Bench or reading credentials', () => {
  assert.deepEqual([...blocks.keys()], ['install', 'treatment', 'local-checks', 'smoke', 'run', 'evidence']);
  for (const [step, code] of blocks) {
    const result = spawnSync('bash', ['-n'], { input: code, encoding: 'utf8' });
    assert.equal(result.status, 0, `${step}: ${result.stderr}`);
  }
  assert.match(blocks.get('treatment'), /BENCH_CREDENTIAL_FILE:\?/);
  assert.doesNotMatch(html, /export\s+\w*(?:API_KEY|TOKEN)|sk-[A-Za-z0-9]|--allow-insecure-provider-env/);
});

test('one explicit treatment is reused for no-call checks, smoke and full run', () => {
  const treatment = blocks.get('treatment');
  for (const value of ['--agent claude-code', '--model "$BENCH_MODEL"', '--agent-version "$BENCH_CLI_VERSION"', '--thinking disabled', '--auth api', '--base-url "$BENCH_BASE_URL"', '--credential-file "$BENCH_CREDENTIAL_FILE"', '--session-timeout 1000', '--research-network']) assert(treatment.includes(value), value);
  for (const step of ['local-checks', 'smoke', 'run']) assert(blocks.get(step).includes('"${TREATMENT[@]}"'), step);
  assert.match(blocks.get('local-checks'), /nexteval-bench preflight "\$\{TREATMENT\[@\]\}"/);
  assert.match(blocks.get('local-checks'), /--n-concurrent 1 --output "\$RUN_DIR" --dry-run/);
  assert.match(blocks.get('run'), /--n-concurrent 1 --output "\$RUN_DIR"/);
  assert.match(blocks.get('run'), /--smoke-receipt "\$SMOKE_DIR\/smoke-receipt\.json"/);
  assert.doesNotMatch(blocks.get('run'), /--dry-run/);
});

test('paid commands are isolated and separately authorized; smoke retains six aligned evaluations', () => {
  for (const step of ['install', 'treatment', 'local-checks', 'evidence']) {
    assert.doesNotMatch(blocks.get(step), /nexteval-bench smoke\b/);
    for (const line of blocks.get(step).replaceAll('\\\n', '').split('\n').filter(line => /nexteval-bench run\b/.test(line))) assert.match(line, /--dry-run/);
  }
  assert.match(section('smoke'), /explicitly authorized/);
  assert.match(section('run'), /own authorization/);
  assert.match(section('smoke'), /exactly six successful objective evaluations/);
  for (const evidence of ['clean histories', 'receipt-bound inventory', 'native model/version', 'confirmed cleanup', 'copied receipt alone']) assert(section('smoke').includes(evidence));
  assert.match(section('smoke'), /Do not run a replacement smoke automatically/);
});

test('saved status separates denominators, evidence, archive and publication without promoting noeval', () => {
  assert.match(blocks.get('evidence'), /nexteval-bench status "\$RUN_DIR"/);
  assert.match(blocks.get('evidence'), /nexteval-bench artifacts check "\$RUN_DIR"/);
  for (const state of ['Expected', 'Materialized', 'Evidence-eligible terminal', 'Pending or review', 'Archived', 'Published', 'eligible_numerical_terminal', 'infra_pending', 'unknown_review', 'automatic_retry=false', 'split_epochs']) assert(section('evidence').includes(state), state);
  assert.match(section('evidence'), /Incomplete scores stay blank/);
  assert.match(section('evidence'), /no generic no-evaluation permit is admitted/);
  assert.match(section('evidence'), /Missing either or both remains review-only/);
  assert.match(section('evidence'), /no automatic legacy admission policy/);
  assert.match(section('evidence'), /does not fetch the destination/);
  assert.match(section('local-checks'), /expected counts, not materialized attempts or scores/);
});

test('local readiness and provider support are not runtime or transport certification', () => {
  for (const phrase of ['local_ready=true', 'model_calls=0', 'installed container CLI version', 'unverified']) assert(section('local-checks').includes(phrase));
  assert.match(section('boundaries'), /Exact provider\/model\/endpoint support is unknown/);
  assert.match(section('boundaries'), /count_tokens<\/code> support and fallback behavior are unknown/);
  assert.match(section('boundaries'), /No provider, Docker experiment or genuine native CLI session was executed/);
  assert.match(section('run'), /not hostile-submission isolation or hosted security acceptance/);
  assert.match(section('run'), /adds no transport or scaffold/);
});

// Opt in to static-page browser QA; no Bench process or external request is run.
test('desktop/mobile layout, breadcrumb, copy success and clipboard failure', { skip: process.env.BENCH_RUN_BROWSER !== '1' }, async () => {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const artifacts = process.env.SITE_TEST_ARTIFACTS || await mkdtemp(join(tmpdir(), 'nexteval-bench-run-'));
  await mkdir(artifacts, { recursive: true });
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) return res.writeHead(403).end();
    try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.SITE_BROWSER_CHANNEL ? { channel: process.env.SITE_BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
    await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    const faults = [];
    page.on('pageerror', error => faults.push(error.message));
    page.on('response', response => { if (response.status() >= 400) faults.push(`${response.status()} ${response.url()}`); });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto(base + '/bench/run/', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.copy-code').count(), blocks.size);
      assert.equal(await page.locator('h1').innerText(), 'Run locally');
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll('.api-body p, .api-definitions dt, .api-definitions dd, .api-body h2')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent.trim().slice(0, 100)),
        images: [...document.images].every(image => image.complete && image.naturalWidth > 0),
        sections: [...document.querySelectorAll('.api-body section')].map(section => ({ top: section.getBoundingClientRect().top, bottom: section.getBoundingClientRect().bottom })),
      }));
      await page.screenshot({ path: join(artifacts, `bench-run-${width}.png`), fullPage: true });
      assert(metrics.scrollWidth <= width + 1, `page overflow at ${width}: ${JSON.stringify(metrics.overflow)}; screenshots ${artifacts}`);
      assert(metrics.images, `image missing at ${width}`);
      for (let i = 1; i < metrics.sections.length; i++) assert(metrics.sections[i].top >= metrics.sections[i - 1].bottom, `section overlap at ${width}`);
      await page.locator('.context-switcher summary').click();
      assert.equal(await page.getByRole('navigation', { name: 'Bench', exact: true }).getByRole('link', { name: 'Run locally', exact: true }).getAttribute('aria-current'), 'page');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.context-switcher').getAttribute('open'), null);
      for (const [index, code] of [...blocks.values()].entries()) {
        await page.locator('.copy-code').nth(index).click();
        await page.waitForFunction(index => document.querySelectorAll('.copy-status')[index].textContent === 'Copied', index);
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
      }
    }
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
    await page.locator('.copy-code').first().click();
    await page.waitForFunction(() => document.querySelector('.copy-status').textContent === 'Clipboard unavailable');
    assert.deepEqual(faults, []);
    console.log(JSON.stringify({ browserQA: 'passed', widths: [320, 390, 768, 1440], artifacts, modelCalls: 0 }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
