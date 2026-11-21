// Read-only browser checks. Can run against a local build or the public site without provider credit.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8787/');
const choices = ['ml', 'en', 'hi', 'ta', 'kn', 'te'];
const brands = ['Samsung', 'LG', 'Sony', 'TCL', 'Hisense', 'Xiaomi'];
const out = 'tmp/shots-library';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
  for (const box of await page.locator('.brand-tile:visible, .brand-resource summary:visible').evaluateAll(elements =>
    elements.map(el => [el.offsetWidth, el.offsetHeight]))) assert.ok(box.every(n => n >= 48), 'small tap target');
}

try {
  for (const width of [360, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 820 }, reducedMotion: 'reduce' });
    const errors = [];
    const api = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) api.push(req.url()); });
    for (const locale of choices) {
      await page.goto(new URL('?lang=en', base).href);
      const select = page.locator('.lang-toggle');
      assert.deepEqual(await select.locator('option').evaluateAll(opts => opts.map(o => o.value)), choices);
      await select.selectOption(locale);
      await page.waitForFunction(l => document.documentElement.lang === l, locale);
      const homeTitle = await page.locator('.home-intro h1').innerText();
      if (locale !== 'en') assert.notEqual(homeTitle, 'Got your remote?');
      assert.deepEqual(await page.locator('.brand-tile strong').allTextContents(), brands);
      await fits(page);
      if (locale === 'ml' && width === 430) await page.screenshot({ path: out + '/home-ml.png', fullPage: true });
      await page.locator('.route-card[href*="presets"]').click();
      await page.locator('.brand-tile').first().waitFor();
      await fits(page);
      if (locale === 'hi' && width === 430) await page.screenshot({ path: out + '/brands-hi.png', fullPage: true });
      const query = page.getByRole('searchbox');
      await query.fill('tcl');
      const tile = page.getByRole('link', { name: /^TCL/ });
      assert.equal(await tile.count(), 1);
      assert.equal(await page.locator('.brand-tile').count(), 1);
      await tile.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'TCL', exact: true }).waitFor();
      const articles = page.locator('.brand-resource');
      assert.equal(await articles.count(), 2);
      await articles.first().locator('summary').focus();
      await page.keyboard.press('Space');
      await articles.first().locator('ol').waitFor();
      assert.match(await articles.first().locator('ol').innerText(), /HDMI 2/);
      assert.equal(await articles.first().locator('a').getAttribute('href'), 'https://www.tcl.com/in/en/support-tv/faq/2479');
      await fits(page);
      if (locale === 'ta' && width === 430) await page.screenshot({ path: out + '/tcl-ta.png', fullPage: true });
      await page.reload();
      await page.getByRole('heading', { name: 'TCL', exact: true }).waitFor();
      assert.equal(await select.inputValue(), locale);
      await page.goBack();
      await page.getByRole('searchbox').waitFor();
      await page.goto(base.href);
      await page.locator('.home-intro h1').waitFor();
      assert.equal(await select.inputValue(), locale);
      assert.equal(await page.locator('.home-intro h1').innerText(), homeTitle);
    }
    for (const brand of brands) {
      await page.goto(new URL('?flow=presets&brand=' + brand.toLowerCase() + '&lang=en', base).href);
      await page.getByRole('heading', { name: brand, exact: true }).waitFor();
      const sources = page.locator('.manufacturer-source');
      assert.ok(await sources.count() >= 1, brand + ' has guides');
      assert.ok((await sources.evaluateAll(links => links.map(a => a.href))).every(href => href.startsWith('https://')));
      await fits(page);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(api, [], 'Brand help must work without a provider');
    await page.close();
    console.log('PASS ' + width + 'px: six languages, brand tiles, task lists, search, keyboard, reload, history and text-only access.');
  }
} finally {
  await browser.close();
}
