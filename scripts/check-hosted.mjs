import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { chromium } from 'playwright-core';

const target = process.argv[2];
if (!target) throw new Error('Pass the public deployment directory or an HTTPS site URL.');

// Opt-in live regression for the 60-second timeouts seen with button-dense remotes.
async function checkLivePhoto(browser, base, photo) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto(base + '?lang=ml');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.capture-gallery').click();
  await (await chooser).setFiles({ name: 'practice.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByRole('button', { name: /ഈ ഫോട്ടോ മതി|എന്നാലും ഇത് മതി/ }).click();
  await page.getByLabel('ഏത് ഭാഷയിൽ പറഞ്ഞുതരണം?').selectOption('ml');
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('ടിവിയിലെ മ്യൂട്ട് മാറ്റണം.');
  const start = performance.now();
  async function submit(button) {
    const response = page.waitForResponse(r => r.url() === base + 'api/guide', { timeout: 130_000 });
    await button.click();
    const res = await response;
    assert.equal(res.status(), 200, 'Photo guide HTTP status');
    return res.json();
  }
  function checkMute(result, id) {
    const control = result.observedControls.find(c => c.id === id);
    assert.equal(control?.role, 'mute');
    const { x, y, w, h } = control.bbox;
    const cx = (x + w / 2) * 315, cy = (y + h / 2) * 1365;
    // MUTE was independently measured at (131, 486), size 52 × 63 on the licensed crop.
    assert.ok(cx >= 131 && cx <= 183 && cy >= 486 && cy <= 549, 'Highlight must land on the printed MUTE button');
  }
  let result = await submit(page.getByRole('button', { name: 'ഗൈഡ് ഉണ്ടാക്കുക' }));
  if (result.clarification?.kind === 'confirm_button') {
    checkMute(result, result.clarification.controlId);
    result = await submit(page.getByRole('button', { name: /അതെ, ഈ ബട്ടൺ തന്നെ/ }));
  }
  assert.equal(result.demo, false);
  assert.equal(result.status, 'ready');
  assert.equal(result.locale, 'ml');
  checkMute(result, result.steps[0].controlId);
  await page.getByTestId('hotspot').waitFor();
  assert.match(await page.locator('.instruction').innerText(), /\p{Script=Malayalam}/u);
  console.log('PASS live Malayalam unmute guide and measured MUTE highlight in ' + ((performance.now() - start) / 1000).toFixed(1) + 's.');
  await page.close();
}

let server, browser;
try {
  let base;
  if (target.startsWith('https://')) {
    base = new URL('/', target).href;
  } else {
    const folder = resolve(target);
    const api = (await import(pathToFileURL(join(folder, 'api/index.mjs')).href)).default;
    const app = new Hono();
    app.all('/api/*', c => api.fetch(c.req.raw));
    app.use('/*', serveStatic({ root: join(folder, 'dist') }));
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
    await new Promise(resolve => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port + '/';
  }
  const health = await fetch(base + 'api/health');
  assert.equal(health.status, 200);
  const { ok, demo, guide, speech } = await health.json();
  assert.equal(ok, true);
  assert.equal(demo, false);
  const status = await fetch(base + 'api/family/status');
  assert.equal(status.status, 200);
  const family = await status.json();
  assert.equal(typeof family.sharing, 'boolean');
  assert.equal(typeof family.sarvam, 'boolean');
  assert.equal((await fetch(base + 'api/family/view')).status, 404);
  for (const file of ['unlisted-remote.jpg', 'private-photo.jpg']) {
    assert.equal((await fetch(base + 'devices/' + file, { method: 'HEAD' })).status, 404);
  }
  const image = await fetch(base + 'devices/coolux-practice.jpg');
  const photo = Buffer.from(await image.arrayBuffer());
  assert.equal(createHash('sha256').update(photo).digest('hex'),
    '99765fb9cd019e18bc538a166b820830a64a7064ae790185a68bce014fd7b007');
  assert.match(await (await fetch(base + 'photo-credit.txt')).text(), /TaurusEmerald/);
  browser = await chromium.launch({ channel: 'chrome' });
  const film = await browser.newPage();
  await film.goto(base + 'demo/');
  await film.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1);
  const metadata = await film.locator('video').evaluate(video => ({
    width: video.videoWidth, height: video.videoHeight, seconds: video.duration, paused: video.paused,
    captions: video.querySelector('track[kind="captions"]')?.src,
  }));
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
  assert.ok(Math.abs(metadata.seconds - 49) < .15 && metadata.paused);
  assert.match(await (await fetch(metadata.captions)).text(), /^WEBVTT/);
  await film.close();
  for (const [width, language] of [[360,'en'], [430,'ml']]) {
    const page = await browser.newPage({ viewport: { width, height: 820 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?lang=' + language);
    await page.locator('.capture-primary').waitFor();
    await page.locator('.home-example .example-remote').waitFor();
    await page.locator('.practice-link').click();
    const mark = page.getByTestId('hotspot');
    await mark.waitFor();
    assert.match(await page.locator('.instruction').innerText(), /SOURCE/i);
    assert.equal(await page.locator('.remote img').evaluate(el => el.naturalHeight), 1365);
    await page.locator('.btn-yes').click();
    await mark.waitFor();
    await page.goto(base + '?flow=family&lang=en');
    await page.getByRole('button', { name: 'Start with your own remote photo' }).click();
    await page.getByLabel('Guide title', { exact: true }).fill('Phone rehearsal');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByText('Draft saved on this device.').waitFor();
    assert.equal(errors.length, 0);
    await page.close();
  }
  console.log('PASS signed-out home, licensed photo and button, practice steps, local drafts, private photos excluded, API routes. Live guide configured=' + guide + ', speech=' + speech + ', family sharing=' + family.sharing);
  if (process.argv.includes('--live-photo')) {
    assert.ok(guide, 'Configure the live guide provider before running the paid photo check.');
    await checkLivePhoto(browser, base, photo);
  }
} finally {
  await browser?.close();
  if (server) server.close();
}
