// Local Chrome, real on-disk SQLite, ephemeral creator and signed-out recipient.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = join(root, 'tmp');
mkdirSync(temp, { recursive: true });
const run = mkdtempSync(join(temp, 'v4-browser-'));
const practicePhoto = join(root, 'public/devices/coolux-practice.jpg');
const rotated = join(temp, 'fixtures/practice-rotated.jpg');
const key = randomBytes(32).toString('base64url');
const server = spawn(process.execPath, ['build/server/index.js'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1', STATIC_ROOT: join(root, 'dist'), INGANE_PROVIDER: 'mock',
    INGANE_FAMILY_PRIVATE_DIR: join(run, '.ingane-private'), INGANE_FAMILY_CREATORS: JSON.stringify({ test: createHash('sha256').update(key).digest('hex') }) },
});
let browser;
const logs = [];
server.stdout.on('data', d => logs.push(String(d)));
server.stderr.on('data', d => logs.push(String(d)));
const wait = ms => new Promise(r => setTimeout(r, ms));
const btn = (page, name) => page.getByRole('button', { name, exact: true });
const input = (page, name) => page.getByLabel(name, { exact: true });
async function openSection(page, name) {
  const summary = page.locator('summary').filter({hasText:name});
  if (!await summary.evaluate(el => el.parentElement.open)) await summary.click();
}
const currentStep = page => page.locator('.family-step:has(.step-fields)');
async function guardMedia(base, token, step, status) {
  for (const path of ['view', 'photo', 'clip/' + step]) {
    const res = await fetch(base + 'api/family/' + path, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(res.status, status);
    assert.match(res.headers.get('cache-control'), /no-store/);
    if (status === 404) assert.deepEqual(await res.json(), { error: 'unavailable' });
  }
}
async function startFamily(page, base) {
  await page.goto(base + '?flow=presets&lang=en');
  await btn(page, 'Try the demo').click(); await btn(page, 'Ingane Demo').click();
  await page.getByRole('button', { name: /DEMO-TV-01/ }).click();
  await page.getByRole('button', { name: /My remote matches/ }).click();
  await input(page, 'Task').selectOption('demo-hdmi');
  await page.getByLabel(/Which HDMI port/).selectOption('HDMI 2');
  await input(page, 'Guide language').selectOption('ml');
  await btn(page, 'Make a copy for family').click();
  await page.getByRole('heading', { name: 'Edit family guide' }).waitFor();
}
try {
  let address;
  for (let i = 0; i < 100 && !address; i++) {
    if (server.exitCode !== null) throw new Error('Local Family Guides test server failed to start');
    address = logs.join('').match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (!address) await wait(100);
  }
  assert.ok(address, 'Local test server did not start');
  const base = address + '/';
  assert.deepEqual(await (await fetch(base + 'api/family/status')).json(), { sharing: true, sarvam: false });
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
  const creator = await browser.newContext({ viewport: { width: 360, height: 800 }, permissions: ['microphone'], reducedMotion: 'reduce' });
  const page = await creator.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await startFamily(page, base);
  await input(page, 'Guide title').fill('Amma, switch to HDMI 2');
  await page.getByText('More guide details', { exact: true }).click();
  await input(page, 'Recipient nickname (optional)').fill('Amma');
  const instruction = 'അമ്മേ, ഇൻപുട്ട് ബട്ടൺ ഒരു തവണ അമർത്തൂ.';
  await input(page, 'One action to take').fill(instruction);
  await openSection(page, 'Step narration');
  await page.getByLabel('App language').selectOption('ml');
  assert.equal(await page.locator('#family-title').inputValue(), 'Amma, switch to HDMI 2');
  assert.equal(await page.locator('textarea[id$="-instruction"]').inputValue(), instruction);
  assert.equal(await page.locator('select[aria-describedby="guide-lang-hint"]').inputValue(), 'ml');
  await page.locator('.topbar select').selectOption('en');
  await page.getByRole('button', { name: /Record narration/ }).click();
  await page.getByRole('button', { name: /Stop recording/ }).waitFor();
  await input(page, 'One action to take').fill(instruction + ' HDMI 2');
  await page.getByRole('button', { name: /Record narration/ }).waitFor();
  assert.equal(await page.locator('audio').count(), 0);
  await input(page, 'One action to take').fill(instruction);
  assert.ok(await btn(page, 'Generate Sarvam narration').isDisabled());
  await page.getByRole('button', { name: /Record narration/ }).click();
  await page.getByRole('button', { name: /Stop recording/ }).waitFor();
  await wait(850);
  await page.getByRole('button', { name: /Stop recording/ }).click();
  await page.locator('audio').waitFor();
  const originalAudio = await page.locator('audio').getAttribute('src');
  await page.getByRole('button', { name: /Record replacement/ }).click();
  await page.getByRole('button', { name: /Stop recording/ }).waitFor();
  await wait(650); await page.getByRole('button', { name: /Stop recording/ }).click();
  await page.waitForFunction(old => document.querySelector('audio')?.src && document.querySelector('audio').src !== old, originalAudio);
  await btn(page, 'Save draft').click(); await page.getByText('Draft saved on this device.').waitFor();
  await btn(page, 'Preview guide').click();
  await page.getByRole('heading', { name: 'Amma, switch to HDMI 2' }).waitFor();
  await btn(page, 'കേൾക്കാം').click(); await btn(page, 'വീണ്ടും കേൾക്കാം').waitFor();
  assert.equal(await page.locator('.instruction').innerText(), instruction);
  await btn(page, 'എന്റെ സ്ക്രീൻ വ്യത്യസ്തമാണ്').click();
  assert.equal(await btn(page, 'ഇങ്ങനെ തന്നെ').count(), 0);
  await btn(page, 'ഈ ഘട്ടം വീണ്ടും നോക്കാം').click();
  await btn(page, 'Back to editor').click();
  await input(page,'Guide language').selectOption('ta');
  assert.equal(await input(page,'One action to take').inputValue(), instruction);
  await input(page,'Guide language').selectOption('ml');
  await openSection(page, 'Exact TV label');
  await input(page,'Exact TV label (optional)').fill('HDMI 2');
  await openSection(page, 'Step narration');
  const approve = btn(page,'Approve this clip for the current step');
  assert.ok(await approve.isDisabled());
  await btn(page,'Preview guide').click();
  await page.locator('.instruction').waitFor();
  assert.equal(await page.locator('.btn-listen').count(),0);
  await btn(page,'Back to editor').click();
  await openSection(page, 'Step narration');
  await page.locator('audio').evaluate(el => el.play());
  await page.waitForFunction(() => document.querySelector('.narration-panel audio')?.ended);
  await approve.click();
  await btn(page,'Save draft').click();
  await page.getByText('Draft saved on this device.').waitFor();
  await input(page, 'Creator access key').fill(key); await btn(page, 'Creator sign-in').click();
  await btn(page, 'Share link').click();
  assert.ok(await btn(page, 'Create read-only link').isDisabled());
  await page.getByRole('checkbox').check(); await btn(page, 'Create read-only link').click();
  const link = page.getByRole('textbox', { name: 'Share link', exact: true });
  await link.waitFor(); const first = await link.inputValue(), token = new URL(first).hash.slice(1);
  assert.ok(/^[\w-]{43}$/.test(token));
  await page.evaluate(() => {
    window.shareActions = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => { window.shareActions.push(['copy', url]); } } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.shareActions.push(['sheet', data.url]); } });
  });
  await btn(page, 'Copy link').click(); await btn(page, 'Share via…').click();
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  await btn(page, 'Share via…').click();
  assert.ok(await page.evaluate(url => JSON.stringify(window.shareActions) === JSON.stringify([['copy',url],['sheet',url],['copy',url]]), first));
  const recipient = await browser.newContext({ viewport: { width: 430, height: 780 }, reducedMotion: 'reduce' });
  const parent = await recipient.newPage(); const urls = [];
  parent.on('request', req => urls.push(req.url().split('#')[0]));
  await parent.goto(first); await parent.getByRole('heading', { name: 'Amma, switch to HDMI 2' }).waitFor();
  assert.equal(await parent.getByRole('textbox').count(), 0);
  assert.equal(await parent.locator('.instruction').innerText(), instruction);
  assert.equal(urls.filter(u => u.includes('/api/family/clip/')).length, 0);
  await parent.route('**/api/family/clip/**', r => r.abort());
  await btn(parent, 'കേൾക്കാം').click(); await parent.locator('.audio-failed').waitFor();
  assert.equal(await parent.locator('.instruction').innerText(), instruction);
  await parent.unroute('**/api/family/clip/**');
  await btn(parent, 'കേൾക്കാം').click(); await btn(parent, 'വീണ്ടും കേൾക്കാം').waitFor();
  const snap = await (await fetch(base + 'api/family/view', { headers: { Authorization: 'Bearer ' + token } })).json();
  const firstStep = snap.steps[0].id;
  await guardMedia(base, token, firstStep, 200);
  const delayedAudio = Buffer.from(await (await fetch(base+'api/family/clip/'+encodeURIComponent(firstStep),
    {headers:{Authorization:'Bearer '+token}})).arrayBuffer());
  for (let i = 0; i < 4; i++) { await parent.getByTestId('hotspot').waitFor(); await btn(parent, 'ഇങ്ങനെ തന്നെ').click(); }
  await parent.getByRole('heading', { name: 'കഴിഞ്ഞു!' }).waitFor();
  await parent.getByRole('button', { name: /വീണ്ടും തുടങ്ങുക/ }).click();
  await input(page, 'Guide title').fill('Amma, HDMI 2 again');
  await btn(page, 'Save draft').click(); await page.getByText('Draft saved on this device.').waitFor();
  await parent.reload(); await parent.getByRole('heading', { name: 'Amma, switch to HDMI 2' }).waitFor();
  await btn(page, 'Replace shared copy and revoke old link').click();
  await page.getByRole('checkbox').check(); await btn(page, 'Revoke old link and create replacement').click();
  await page.waitForFunction(old => document.querySelector('.family input[readonly]')?.value !== old, first);
  const second = await link.inputValue(), secondToken = new URL(second).hash.slice(1);
  await guardMedia(base, token, firstStep, 404);
  await parent.goto(second); await parent.getByRole('heading', { name: 'Amma, HDMI 2 again' }).waitFor();
  await btn(page, 'Stop sharing').click(); await btn(page, 'Stop sharing').click();
  await page.getByText('Sharing stopped.').waitFor();
  await guardMedia(base, secondToken, firstStep, 404);
  await openSection(page, 'Step narration');
  await btn(page, 'Remove narration').click();
  assert.equal(await page.locator('audio').count(), 0);
  await parent.reload(); await parent.locator('h1').waitFor();
  assert.equal(await parent.locator('.player').count(), 0);
  await parent.goto(base + '?flow=family-view&lang=en#invalid');
  await parent.getByRole('heading', { name: 'This guide is unavailable' }).waitFor();
  assert.ok(!(await parent.locator('body').innerText()).includes('Amma'));
  assert.ok(!urls.some(u => u.includes(token) || u.includes(secondToken)));
  assert.ok(!logs.join('').includes(token) && !logs.join('').includes(secondToken) && !logs.join('').includes(key));
  assert.deepEqual(errors, []);
  console.log('PASS V3 HDMI 2 copy, Malayalam preview, personal recording/replacement, signed-out completion, private snapshot, replace and revoke');
  await creator.close(); await recipient.close();

  for (const width of [360, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const p = await context.newPage();
    await p.route('**/api/**', r => r.abort());
    await p.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError')); });
    await p.goto(base + '?flow=family&lang=en'); await btn(p, 'Start with your own remote photo').click();
    await btn(p,'Save draft').click(); await p.getByText('Draft saved on this device.').waitFor();
    await btn(p, 'Preview guide').click(); await p.getByText('Add a guide title.').waitFor();
    await p.waitForFunction(() => document.activeElement.id === 'family-title');
    assert.ok(await btn(p, 'Share link').isDisabled());
    await input(p, 'Guide title').fill('Manual remote');
    await p.getByTestId('family-photo').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await p.getByText('Add a readable remote photo.', { exact: true }).first().waitFor();
    await p.getByTestId('family-photo').setInputFiles(existsSync(rotated) ? rotated : practicePhoto);
    await btn(p, 'Place mark at centre').click(); await input(p, 'Button name').fill('Centre wheel');
    const viewport = p.locator('.remote-viewport');
    await viewport.scrollIntoViewIfNeeded();
    const tap = await viewport.evaluate(el => {
      const image = el.querySelector('img').getBoundingClientRect(), clip = el.getBoundingClientRect();
      const y = (Math.max(0, clip.top, image.top) + Math.min(innerHeight, clip.bottom, image.bottom)) / 2;
      return { x: image.left + image.width * .64, y, top: (y - image.top) / image.height };
    });
    await p.touchscreen.tap(tap.x, tap.y);
    const centre = await p.getByTestId('hotspot').evaluate(el => ({
      x: (parseFloat(el.style.left) + parseFloat(el.style.width) / 2) / 100,
      y: (parseFloat(el.style.top) + parseFloat(el.style.height) / 2) / 100,
    }));
    assert.ok(Math.abs(centre.x - .64) < .01 && Math.abs(centre.y - tap.top) < .01);
    await p.getByText('Adjust button mark', { exact: true }).click();
    const sliders = p.getByRole('slider');
    await sliders.nth(0).focus(); await p.keyboard.press('ArrowRight');
    await sliders.nth(2).focus(); await p.keyboard.press('ArrowRight');
    const box = await p.getByTestId('hotspot').evaluate(e => [e.style.left,e.style.top,e.style.width,e.style.height].map(v => parseFloat(v) / 100));
    await input(p, 'One action to take').fill('Press the wheel once.');
    await p.setViewportSize({width,height:450});
    const focused = input(p,'One action to take');
    await focused.focus(); await focused.scrollIntoViewIfNeeded();
    assert.equal(await p.locator('.editor-actions').evaluate(el => getComputedStyle(el).position), 'static');
    assert.ok(await focused.evaluate(el => {
      const bounds = el.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight;
    }));
    await p.setViewportSize({width,height:800});
    await input(p, 'What should they see?').fill('The input list opens.');
    await input(p, 'What if it looks different?').fill('Check the wheel.');
    await p.getByText('Step narration', { exact: true }).click();
    await p.getByRole('button', { name: /Record narration/ }).click();
    await p.getByText('Microphone access is unavailable. You can continue with text.').waitFor();
    await btn(p, 'Add step').click();
    await currentStep(p).locator('select').first().selectOption('checkpoint');
    await input(p, 'One action to take').fill('Read the port label.');
    await input(p, 'What should they see?').fill('HDMI 2 is visible.');
    await input(p, 'What if it looks different?').fill('Go back.');
    await currentStep(p).locator('summary').filter({ hasText: 'Exact TV label' }).click();
    await input(p, 'Exact TV label (optional)').fill('HDMI 2');
    await currentStep(p).getByText('More step options').click();
    await btn(p, 'Move up · 2').focus(); await p.keyboard.press('Enter');
    await btn(p, 'Add step').click(); await currentStep(p).getByText('More step options').click(); await btn(p, 'Remove step · 3').click();
    await btn(p, 'Save draft').click(); await p.getByText('Draft saved on this device.').waitFor();
    await p.reload(); await btn(p, 'Edit').click(); await btn(p, 'Preview guide').click();
    assert.equal(await p.getByTestId('hotspot').count(), 0);
    assert.equal(await p.locator('.press-anchor, .stage-replay').count(), 0);
    await btn(p, 'I see it').click();
    await p.getByTestId('hotspot').waitFor();
    const delta = await p.evaluate(b => {
      const img = document.querySelector('.remote-frame img').getBoundingClientRect(), r = document.querySelector('.ring').getBoundingClientRect();
      return Math.max(...[r.x-img.x-b[0]*img.width,r.y-img.y-b[1]*img.height,r.width-b[2]*img.width,r.height-b[3]*img.height].map(Math.abs));
    }, box);
    assert.ok(delta < 1); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await p.getByTestId('hotspot').evaluate(el => getComputedStyle(el).animationName), 'none');
    await btn(p, 'Back to editor').click(); await btn(p, 'Back to My Family Guides').click();
    if (width === 360) {
      const other = await context.newPage(); await other.goto(base + '?flow=family&lang=en');
      await btn(other, 'Edit').click(); await btn(p, 'Edit').click();
      await input(other, 'Guide title').fill('Saved in the other tab'); await btn(other, 'Save draft').click();
      await other.getByText('Draft saved on this device.').waitFor();
      await input(p, 'Guide title').fill('Older copy'); await btn(p, 'Save draft').click();
      await p.getByText('This draft changed in another tab. Reopen it before saving.').waitFor();
      await btn(p, 'Back to My Family Guides').click(); await btn(p, 'Leave without saving').click();
      await p.getByRole('heading', { name: 'Saved in the other tab' }).waitFor(); await other.close();
    }
    await btn(p,'Edit').click();
    await p.locator('.step-summary').nth(1).click();
    await p.getByTestId('hotspot').waitFor();
    const written = await input(p,'One action to take').inputValue();
    await p.getByTestId('family-photo').setInputFiles(practicePhoto);
    await btn(p,'Keep current photo').click();
    assert.ok(await p.getByTestId('hotspot').isVisible());
    await p.getByTestId('family-photo').setInputFiles(practicePhoto);
    await btn(p,'Replace photo and clear marks').click();
    await btn(p,'Place mark at centre').waitFor();
    assert.equal(await p.getByTestId('hotspot').count(),0);
    assert.equal(await input(p,'One action to take').inputValue(),written);
    await btn(p,'Back to My Family Guides').click(); await btn(p,'Leave without saving').click();
    await btn(p, 'Delete draft').click(); await btn(p, 'Delete draft').click(); await p.getByText('No saved drafts yet.').waitFor();
    console.log('PASS ' + width + 'px: offline manual photo, mark adjustment, denied mic, keyboard reorder, checkpoints, persistence and deletion');
    await context.close();
  }
  // Delayed synthesis uses a local test transport. No guide, text or audio leaves loopback.
  const pending = await browser.newContext();
  const editing = await pending.newPage();
  await editing.route('**/api/family/status', r => r.fulfill({json:{sharing:true,sarvam:true}}));
  let finishRequest;
  const release = new Promise(resolve => { finishRequest = resolve; });
  await editing.route('**/api/family/owner/narrate', async route => {
    await release;
    await route.fulfill({status:200,contentType:'audio/wav',body:delayedAudio}).catch(() => {});
  });
  await startFamily(editing,base);
  await input(editing,'Creator access key').fill(key); await btn(editing,'Creator sign-in').click();
  await openSection(editing,'Step narration');
  const started = editing.waitForRequest(r => r.url().endsWith('/owner/narrate'));
  await btn(editing,'Generate Sarvam narration').click();
  await started;
  await input(editing,'One action to take').fill('HOME തുറക്കുക.');
  finishRequest();
  await btn(editing,'Generate Sarvam narration').waitFor();
  assert.equal(await editing.locator('audio').count(),0);
  assert.equal(await editing.getByRole('alert').count(),0);
  await btn(editing,'Preview guide').click(); await editing.locator('.instruction').waitFor();
  assert.equal(await editing.locator('.btn-listen').count(),0);
  await pending.close();
  console.log('PASS UI language preserves edits; changing recorded or pending synthesized steps excludes stale clips; replay and approval restore audio');
  const session = await browser.newContext(); const v2 = await session.newPage();
  await v2.goto(base + '?flow=remote&lang=en');
  await v2.getByTestId('gallery-input').setInputFiles(practicePhoto);
  await btn(v2, 'Use this photo').click(); await v2.getByRole('checkbox').check(); await v2.getByRole('textbox').fill('no sound'); await btn(v2, 'Make my guide').click();
  await btn(v2, 'Make a copy for family').click(); await v2.getByText('Review the copied steps and button marks before saving.').waitFor();
  await btn(v2, 'Preview guide').click(); await v2.getByTestId('hotspot').waitFor(); await btn(v2, 'Back to editor').click();
  await btn(v2, 'Back to My Family Guides').click(); await btn(v2, 'Leave without saving').click();
  await v2.getByText('No saved drafts yet.').waitFor();
  console.log('PASS current V2 result enters review and can be discarded before persistence');
  await session.close();
  // These use the mock planner and a deliberately unavailable audio endpoint.
  for (const [language, request, script] of [
    ['hi','टीवी की Home स्क्रीन खोलें।',/\p{Script=Devanagari}/u],
    ['ta','Home திரையைத் திறக்கவும்.',/\p{Script=Tamil}/u],
    ['kn','Home ಪರದೆ ತೆರೆಯಿರಿ.',/\p{Script=Kannada}/u],
    ['te','Home తెర తెరవండి.',/\p{Script=Telugu}/u],
  ]) {
    const ctx = await browser.newContext({viewport:{width:360,height:800},reducedMotion:'reduce'});
    const page = await ctx.newPage();
    await page.route('**/api/health',r=>r.fulfill({json:{ok:true,guide:true,speech:true,demo:false}}));
    await page.route('**/api/speak',r=>r.fulfill({status:503,body:'{}'}));
    await page.goto(base+'?flow=remote&lang=en');
    await page.getByTestId('gallery-input').setInputFiles(practicePhoto);
    await page.getByRole('button',{name:'Use this photo'}).click();
    await page.getByLabel('Which language should I guide you in?').selectOption(language);
    await page.getByRole('textbox').fill(request);
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'Make my guide'}).click();
    await page.getByTestId('hotspot').waitFor();
    const instruction=await page.locator('.instruction').innerText();
    assert.ok(script.test(instruction) && instruction.includes('Home'));
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.locator('.btn-listen').click();
    await page.locator('.audio-failed').waitFor();
    assert.equal(await page.locator('.instruction').innerText(),instruction);
    assert.ok(await page.locator('.btn-yes').isEnabled());
    await btn(page,'Make a copy for family').click();
    assert.equal(await input(page,'Guide language').inputValue(),language);
    assert.equal(await input(page,'One action to take').inputValue(),instruction);
    await btn(page,'Preview guide').click(); await page.getByTestId('hotspot').waitFor();
    assert.equal(await page.locator('.instruction').innerText(),instruction);
    console.log('PASS '+language+' generated photo guide, exact Home label, text fallback and independent recipient preview (mock)');
    await ctx.close();
  }


} finally {
  await browser?.close(); server.kill();
}
