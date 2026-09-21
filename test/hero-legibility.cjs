const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

async function main() {
  const output = process.env.SITE_TEST_ARTIFACTS;
  if (output) await fs.mkdir(output, { recursive: true });
  const url = process.env.SITE_BASE_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
  const browser = await chromium.launch({ headless: true, channel: process.env.SITE_BROWSER_CHANNEL || 'chrome' });
  const results = [];
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1000, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const bounds = await page.locator('.brand-hero .slogan-meanings').boundingBox();
      const clip = { x: Math.floor(bounds.x) - 6, y: Math.floor(bounds.y) - 6, width: Math.ceil(bounds.width) + 12, height: Math.ceil(bounds.height) + 12 };
      const visible = await page.screenshot({ clip });
      if (output) {
        await fs.writeFile(path.join(output, `wording-${width}.png`), visible);
        await page.screenshot({ path: path.join(output, `hero-${width}.png`) });
      }
      await page.locator('.hero-field').evaluate(element => { element.style.visibility = 'hidden'; });
      const hidden = await page.screenshot({ clip });
      const a = PNG.sync.read(visible);
      const b = PNG.sync.read(hidden);
      assert.equal(a.data.length, b.data.length);
      let changedPixels = 0;
      let largestDifference = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const difference = Math.max(...[0, 1, 2].map(channel => Math.abs(a.data[i + channel] - b.data[i + channel])));
        largestDifference = Math.max(largestDifference, difference);
        if (difference > 3) changedPixels++;
      }
      results.push({ width, changedPixels, largestDifference });
    }
    console.log(JSON.stringify(results, null, 2));
    assert.ok(results.every(result => result.changedPixels === 0), 'Background markers or curves intrude into the slogan wording');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
