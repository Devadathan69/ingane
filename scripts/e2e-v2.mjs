// V2 real-browser checks against the built server in MOCK mode (demo data, not live inference):
//   npm run build
//   INGANE_PROVIDER=mock INGANE_MOCK_FAILURES=1 node build/server/index.js
//   node scripts/e2e-v2.mjs [baseUrl] [staticV1Url]
// All photos sent by this suite are freshly drawn synthetic fixtures.
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { makeTestPhotos } from './remote-test-images.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787/';
const STATIC = process.argv[3];
if (![BASE, STATIC].filter(Boolean).every(url => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname))) throw Error('Use a local mock server.');
const health = await (await fetch(new URL('api/health', BASE))).json();
if (!health.demo || health.provider !== 'mock') throw Error('This suite requires mock providers.');
const OUT = 'tmp/shots-v2';
mkdirSync(OUT, { recursive: true });
const FX = mkdtempSync('tmp/remote-browser-');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

await makeTestPhotos(browser, FX);

async function newPage(width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

async function start(page, lang = 'en') {
  await page.goto(`${BASE}?flow=remote&lang=${lang}`);
  await page.getByTestId('gallery-input').waitFor({ state: 'attached' });
}

async function upload(page, file) {
  await page.getByTestId('gallery-input').setInputFiles(file);
}

async function ringMatchesImage(page, bbox) {
  return page.evaluate((b) => {
    const img = document.querySelector('.remote-frame img').getBoundingClientRect();
    const r = document.querySelector('[data-testid=hotspot]').getBoundingClientRect();
    const exp = { left: img.left + b.x * img.width, top: img.top + b.y * img.height, width: b.w * img.width, height: b.h * img.height };
    const d = Math.max(Math.abs(r.left - exp.left), Math.abs(r.top - exp.top), Math.abs(r.width - exp.width), Math.abs(r.height - exp.height));
    return { ok: d <= 1.5, d: d.toFixed(2) };
  }, bbox);
}

// Each entry opens a native chooser on a click. Cancelling or previewing never sends media.
for (const [source, label] of [['camera','Take a photo of your remote'],['gallery','Choose from gallery']]) {
  const { ctx, page } = await newPage(360);
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    window.permissionRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.permissionRequests++; throw new DOMException('Denied','NotAllowedError'); };
  });
  await page.goto(BASE+'?lang=en');
  let opening = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:label,exact:true}).click();
  const cancelled = await opening;
  check(source+' uses the expected chooser', await cancelled.element().getAttribute('capture') === (source === 'camera' ? 'environment' : null));
  await cancelled.setFiles([]);
  check(source+' cancellation stays on home with gallery available', await page.locator('.capture-gallery').isVisible());
  opening=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:label,exact:true}).click();
  await (await opening).setFiles(FX+'/remote.jpg');
  await page.getByTestId('photo-preview').waitFor();
  check(source+' enters the existing photo route',new URL(page.url()).searchParams.get('flow') === 'remote');
  await page.getByRole('button',{name:'Use this photo'}).click();
  await page.getByRole('textbox').fill('HOME');
  check(source+' waits for consent and keeps permissions idle', posts.length === 0 && await page.evaluate(() => window.permissionRequests === 0) &&
    await page.getByRole('button',{name:'Make my guide'}).isDisabled());
  await ctx.close();
}

// 1. Happy path at two widths, Malayalam with Manglish typed input
for (const width of [360, 430]) {
  const { ctx, page, errors } = await newPage(width);
  // Advertise the local WAV fixture as available for this playback regression only.
  await page.route('**/api/health', r => r.fulfill({ json: { ok: true, guide: true, speech: true, demo: false } }));
  let guide;
  page.on('response', async (r) => {
    if (r.url().includes('/api/guide') && r.ok()) guide = await r.json();
  });
  await start(page, 'ml');
  await upload(page, `${FX}/remote.jpg`);
  await page.getByRole('button', { name: 'ഈ ഫോട്ടോ മതി' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('TV il sound illa');
  await page.getByRole('button', { name: 'ഗൈഡ് ഉണ്ടാക്കുക' }).click();
  await page.waitForSelector('[data-testid=hotspot]');
  check(`${width} ml guide renders with demo label`, await page.getByText('ഡെമോ ഡാറ്റ — ലൈവ് AI അല്ല').isVisible());
  check(`${width} narration/instruction in Malayalam script`, /[\u0D00-\u0D7F]/.test(await page.locator('.instruction').textContent()));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${width} no horizontal overflow`, overflow <= 0, `${overflow}px`);
  const small = await page.$$eval('button, a, textarea', (els) => els.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 48).map((e) => e.textContent?.trim()));
  check(`${width} touch targets >= 48px`, small.length === 0, small.join(' | '));
  for (let i = 0; i < guide.steps.length; i++) {
    const s = guide.steps[i];
    const c = guide.observedControls.find((x) => x.id === s.controlId);
    const m = await ringMatchesImage(page, c.bbox);
    check(`${width} step ${i + 1} ring == image rect × bbox (${c.id})`, m.ok, `${m.d}px`);
    await page.screenshot({ path: `${OUT}/ml-${width}-step${i + 1}.png` });
    if (i === 0) {
      await page.getByRole('button', { name: /കേൾക്കാം/ }).first().click();
      await page.waitForSelector('text=വീണ്ടും കേൾക്കാം', { timeout: 5000 }).catch(() => {});
      check(`${width} Play → Replay (mock audio)`, await page.getByRole('button', { name: /വീണ്ടും കേൾക്കാം/ }).isVisible());
    }
    await page.getByRole('button', { name: /ഇങ്ങനെ തന്നെ/ }).click();
  }
  check(`${width} success only after final confirmation`, await page.getByRole('heading', { name: 'കഴിഞ്ഞു!' }).isVisible());
  check(`${width} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 2. Mismatch, HDMI clarification → screen photo → confirm/mark button → guide; wifi unsupported
{
  const { ctx, page } = await newPage(360);
  let guide;
  page.on('response', async (r) => {
    if (r.url().includes('/api/guide') && r.ok()) guide = await r.json();
  });
  await start(page);
  await upload(page, `${FX}/remote.jpg`);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('no sound');
  await page.getByRole('button', { name: 'Make my guide' }).click();
  await page.getByRole('button', { name: /My screen looks different/ }).click();
  check('mismatch stays on step 1', (await page.locator('h2').textContent()) === 'Step 1 of 2');
  check('mismatch offers a TV-screen photo', await page.getByRole('button', { name: 'Take a photo of my TV screen' }).isVisible());
  await page.getByRole('button', { name: /Start over/ }).last().click();

  await upload(page, `${FX}/remote.jpg`);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('switch to HDMI 1');
  await page.getByRole('button', { name: 'Make my guide' }).click();
  await page.getByRole('heading', { name: 'One quick question' }).waitFor();
  check('uncertain menu opener shows its candidate on the original photo', guide.clarification?.controlId === 'input' && !await page.getByTestId('screen-input').count());
  await page.getByRole('button', { name: 'I can mark the Source/Input button' }).click();
  const img = page.locator('.remote-frame img');
  const box = await img.boundingBox();
  await img.click({ position: { x: box.width * .5, y: box.height * .71 } });
  await page.getByRole('button', { name: 'Use this mark for Source/Input' }).click();
  await page.getByRole('button', { name: 'I see the input list' }).waitFor();
  const source = guide.observedControls.find(c => c.id === 'user_source');
  await page.getByTestId('hotspot').waitFor();
  const mark = await ringMatchesImage(page, source.bbox);
  check('confirmed Source mark opens only the menu checkpoint', guide.status === 'hdmi_checkpoint' && mark.ok &&
    Math.abs(source.bbox.x + source.bbox.w / 2 - .5) < .02 && !await page.getByTestId('screen-input').count());
  await page.getByRole('button', { name: 'That didn’t happen' }).click();
  check('opener mismatch checks the button without prompting for a TV photo', await page.locator('.recovery').getByText(/Compare the marked button/).isVisible() && !await page.getByTestId('screen-input').count());
  await page.getByRole('button', { name: 'Find the button' }).click();
  await page.getByRole('button', { name: 'I see the input list' }).click();
  check('the list offers camera, gallery and typed labels', await page.getByRole('button', { name: 'Take a photo of the TV input list' }).isVisible() &&
    await page.getByRole('button', { name: 'Choose a TV photo from gallery' }).isVisible() && await page.getByRole('textbox').isVisible());
  const beforeScreen = guide;
  await page.getByTestId('screen-input').setInputFiles(FX + '/tv.jpg');
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  check('cancelling TV preview kept the image local', guide === beforeScreen && await page.getByRole('textbox').isVisible());
  await page.getByTestId('screen-gallery').setInputFiles(FX + '/tv.jpg');
  await page.getByRole('button',{name:'Send this screen photo for analysis'}).click();
  await page.getByRole('button',{name:'I see HDMI 1 highlighted'}).waitFor();
  check('resumes at the exact input without guessing a button or arrow count', guide.steps[0].id === 'highlight-input' &&
    !await page.getByTestId('hotspot').count() && (await page.locator('.instruction').textContent()).includes('HDMI 1'));
  await page.getByRole('button',{name:'I see HDMI 1 highlighted'}).click();
  await page.getByRole('button',{name:'I see the device’s picture'}).click();
  check('only actual picture confirmation finishes HDMI', await page.locator('.done').isVisible());
  await page.getByRole('button', { name: /Start over/ }).last().click();

  await upload(page, `${FX}/remote.jpg`);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('set up wifi');
  await page.getByRole('button', { name: 'Make my guide' }).click();
  check('wifi → unsupported, no password request', /never ask for your Wi-Fi password/.test(await page.getByRole('alert').textContent()));
  await ctx.close();
}

// 3. Photo handling: blur, EXIF orientation + metadata stripping, bad formats, letterboxing
{
  const { ctx, page } = await newPage(360);
  await start(page);
  await upload(page, `${FX}/remote.jpg`);
  const sharp = Number(await page.getByTestId('photo-preview').getAttribute('data-sharpness'));
  check('sharp photo: no blur warning', (await page.getByTestId('blur-warning').count()) === 0, `sharpness ${sharp}`);
  await upload(page, `${FX}/blur.jpg`);
  await page.getByTestId('blur-warning').waitFor({ timeout: 5000 }).catch(() => {});
  const blurry = Number(await page.getByTestId('photo-preview').getAttribute('data-sharpness'));
  check('blurry photo: warning + "Use anyway"', (await page.getByTestId('blur-warning').isVisible()) && (await page.getByRole('button', { name: 'Use anyway' }).isVisible()), `sharpness ${blurry}`);

  await upload(page, `${FX}/rotated.jpg`);
  await page.waitForFunction(() => document.querySelector('[data-testid=photo-preview]')?.getAttribute('data-size') === '214x760');
  check('EXIF orientation applied (stored 760x214 → shown 214x760)', true);
  let body;
  await page.route('**/api/guide', async (route) => {
    body = route.request().postDataBuffer();
    await route.continue();
  });
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('no sound');
  await page.getByRole('button', { name: 'Make my guide' }).click();
  await page.waitForSelector('.instruction');
  const s = body.toString('latin1');
  check('uploaded photo has metadata stripped (no Exif/maker text)', !s.includes('Exif') && !s.includes('SECRET-METADATA') && !s.includes('TestCam'));
  await page.unroute('**/api/guide');
  await page.getByRole('button', { name: /Start over/ }).last().click();

  await upload(page, `${FX}/photo.heic`);
  check('HEIC that cannot be decoded → actionable message', /HEIC/.test(await page.getByRole('alert').textContent()));
  await upload(page, `${FX}/notes.txt`);
  check('non-image file → actionable message', /not a photo/.test(await page.getByRole('alert').textContent()));

  await upload(page, `${FX}/landscape.jpg`);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('go home');
  await page.getByRole('button', { name: 'Make my guide' }).click();
  await page.waitForSelector('[data-testid=hotspot]');
  const lb = await page.evaluate(() => {
    const vp = document.querySelector('.remote-viewport').getBoundingClientRect();
    const img = document.querySelector('.remote-frame img').getBoundingClientRect();
    return { letterboxed: img.top - vp.top > 2 && vp.bottom - img.bottom > 2 };
  });
  const m = await ringMatchesImage(page, { x: 128 / 315, y: 645 / 1365, w: 57 / 315, h: 77 / 1365 });
  check('letterboxed landscape photo: ring anchored to image, not viewport', lb.letterboxed && m.ok, `${m.d}px`);
  await page.screenshot({ path: `${OUT}/letterbox.png` });
  await ctx.close();
}

// 4. Microphone: fake device records → server transcribes (mock); denial → typing still works
{
  const { ctx, page } = await newPage(360, { permissions: ['microphone'] });
  await start(page, 'ml');
  await upload(page, `${FX}/remote.jpg`);
  await page.getByRole('button', { name: 'ഈ ഫോട്ടോ മതി' }).click();
  await page.getByRole('checkbox').check();
  const mic = page.getByRole('button', { name: /അമർത്തിപ്പിടിച്ച് പറയുക/ });
  await mic.focus();
  await page.keyboard.press('Enter');
  await page.getByText(/റെക്കോർഡ് ചെയ്യുന്നു/).waitFor({ timeout: 5000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('textarea')?.value.length > 0, null, { timeout: 10000 }).catch(() => {});
  const text = await page.getByRole('textbox').inputValue();
  check('fake-mic recording → editable Malayalam transcript (mock STT)', /[\u0D00-\u0D7F]/.test(text), text);
  await ctx.close();
}
{
  const { ctx, page } = await newPage(360);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await start(page);
  await upload(page, `${FX}/remote.jpg`);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Hold to talk/ }).focus();
  await page.keyboard.press('Enter');
  check('mic denied (simulated) → message', await page.getByText(/Microphone is blocked/).isVisible());
  await page.getByRole('textbox').fill('no sound');
  await page.getByRole('button', { name: 'Make my guide' }).click();
  check('mic denied → typed request still produces a guide', await page.locator('.instruction').waitFor().then(() => true, () => false));
  await ctx.close();
}

// 5. Provider failure surfaces a retry, and retry recovers
{
  const { ctx, page } = await newPage(360);
  let failOnce = true;
  await page.route('**/api/guide', async (route) => {
    const headers = { ...route.request().headers(), ...(failOnce ? { 'x-ingane-mock-fail': 'timeout' } : {}) };
    failOnce = false;
    await route.continue({ headers });
  });
  await start(page);
  await upload(page, `${FX}/remote.jpg`);
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('textbox').fill('no sound');
  await page.getByRole('button', { name: 'Make my guide' }).click();
  check('provider timeout → photo and request available for retry', /photo and request are still here/.test(await page.getByRole('alert').textContent()));
  await page.getByRole('button', { name: 'Try again' }).click();
  check('retry recovers', await page.locator('.instruction').waitFor().then(() => true, () => false));
  await ctx.close();
}

// 6. V1 static host without the API: V2 explains, ready-made guides remain
if (STATIC) {
  const { ctx, page } = await newPage(360);
  await page.goto(`${STATIC}?flow=remote&lang=en`);
  check('static host: V2 explains server is missing', /Live guides need the Ingane server/.test(await page.getByRole('alert').textContent()));
  await page.goto(`${STATIC}?guide=practice-hdmi&lang=en`);
  check('static host: V1 deep link still works', (await page.locator('h1').textContent()) === 'Switch to HDMI 2');
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
