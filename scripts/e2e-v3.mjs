// Run against the built local server in mock mode. The provider returns a short silent WAV.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:8787/';
const out = 'tmp/shots-v3';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

// Independent pixel measurements on the 315 × 1365 public photo of the four individual buttons.
const boxes = { input: [123, 170, 67, 48], down: [137, 880, 42, 66], ok: [132, 819, 51, 50], mute: [131, 486, 52, 63] };

async function checkLayout(page) {
  const problems = await page.evaluate(() => {
    const issues = [...document.querySelectorAll('button,a,input,select,summary')].filter(el => {
      const rect = el.getBoundingClientRect();
      return el.checkVisibility() && rect.height > 0 && (rect.height < 48 || rect.width < 48);
    }).map(el => el.textContent.trim());
    if (document.documentElement.scrollWidth > innerWidth) issues.push('horizontal overflow');
    return issues;
  });
  assert.deepEqual(problems, []);
}

async function checkButton(page, control) {
  await page.getByTestId('hotspot').waitFor();
  const result = await page.evaluate(box => {
    const img = document.querySelector('.remote-frame img');
    const rect = img.getBoundingClientRect();
    const ring = document.querySelector('.ring');
    const r = ring.getBoundingClientRect();
    const vp = document.querySelector('.remote-viewport').getBoundingClientRect();
    const expected = [rect.x + box[0] * rect.width / 315, rect.y + box[1] * rect.height / 1365,
      box[2] * rect.width / 315, box[3] * rect.height / 1365];
    return {
      size: [img.naturalWidth, img.naturalHeight],
      error: Math.max(...[r.x, r.y, r.width, r.height].map((v, i) => Math.abs(v - expected[i]))),
      visible: r.top >= vp.top - 1 && r.bottom <= vp.bottom + 1,
      motion: [getComputedStyle(ring).animationName, getComputedStyle(ring, '::after').animationName],
    };
  }, boxes[control]);
  assert.deepEqual(result.size, [315, 1365]);
  assert.ok(result.error < 1, `${control} offset by ${result.error}px`);
  assert.ok(result.visible, `${control} outside photo viewport`);
  assert.deepEqual(result.motion, ['none', 'none']);
  await checkLayout(page);
}

try {
  for (const [width, locale] of [[360, 'en'], [430, 'ml']]) {
    const ml = locale === 'ml';
    const context = await browser.newContext({
      viewport: { width, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) requests.push(r); });
    const button = name => page.getByRole('button', { name, exact: true });
    const yes = page.locator('.btn-yes');
    const different = button(ml ? 'എന്റെ സ്ക്രീൻ വ്യത്യസ്തമാണ്' : 'My screen looks different');
    const stepTitle = page.locator('#step-heading');

    // Advertise the local WAV fixture to exercise the narration transport without a live key.
    await page.route('**/api/health', r => r.fulfill({ json: { ok: true, guide: true, speech: true, demo: false } }));
    await page.goto(`${base}?lang=en`);
    await page.getByRole('link', { name: /Ready-made guides/ }).click();
    await page.getByText(/no device-verified guides yet/).waitFor();
    await checkLayout(page);
    await button('Try the demo').click();
    await button('Ingane Demo').click();
    await page.getByRole('button', { name: /DEMO-TV-01/ }).click();
    await page.getByRole('heading', { name: 'Confirm your remote' }).waitFor();
    await checkLayout(page);
    await page.screenshot({ path: `${out}/layout-${width}.png` });
    await page.getByRole('button', { name: /My remote matches/ }).click();
    await page.getByLabel('Task', { exact: true }).selectOption('demo-hdmi');
    assert.ok(await button('Start guide').isDisabled());
    await page.getByLabel(/Which HDMI port/).selectOption('HDMI 2');
    await page.getByLabel('Guide language').selectOption(locale);
    await button(ml ? 'ഗൈഡ് തുടങ്ങുക' : 'Start guide').click();
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.ok(requests.every(r => r.url().endsWith('/api/health')));

    const play = button(ml ? 'കേൾക്കാം' : 'Play');
    const wav = page.waitForResponse(r => r.url().endsWith('/api/speak'));
    await play.click();
    assert.equal((await wav).headers()['content-type'], 'audio/wav');
    const replay = button(ml ? 'വീണ്ടും കേൾക്കാം' : 'Replay');
    await replay.waitFor();
    await replay.click();
    const speech = requests.filter(r => r.url().endsWith('/api/speak'));
    assert.equal(speech.length, 1);
    assert.deepEqual(speech[0].postDataJSON(), { locale, preset: {
      version: 2, scope: 'demo', guideId: 'demo-hdmi', stepId: 'open-inputs', port: 'HDMI 2',
    } });

    for (const [index, control] of ['input', 'down', 'down', 'ok'].entries()) {
      await checkButton(page, control);
      if (index === 1) {
        await different.click();
        assert.equal(await yes.count(), 0);
        assert.ok(await button(ml ? 'ടിവി മോഡൽ വീണ്ടും പരിശോധിക്കുക' : 'Recheck my TV model').isVisible());
        await button(ml ? 'ഈ ഘട്ടം വീണ്ടും നോക്കാം' : 'Try this step again').click();
        assert.equal(await stepTitle.textContent(), ml ? 'ഘട്ടം 2 / 4' : 'Step 2 of 4');
        await page.getByRole('button', { name: ml ? /പിന്നോട്ട്/ : /Back/ }).click();
        await checkButton(page, 'input');
        await yes.click();
      }
      if (index === 3) assert.match(await page.locator('.instruction').textContent(), /HDMI 2/);
      await yes.click();
    }
    await page.getByRole('heading', { name: ml ? 'കഴിഞ്ഞു!' : 'Done!' }).waitFor();
    await button(ml ? 'മറ്റൊരു ഗൈഡ് തിരഞ്ഞെടുക്കുക' : 'Choose another task').click();
    await page.getByLabel(ml ? 'ചെയ്യേണ്ട കാര്യം' : 'Task', { exact: true }).selectOption('demo-unmute');
    await button(ml ? 'ഗൈഡ് തുടങ്ങുക' : 'Start guide').click();
    await checkButton(page, 'mute');
    await page.locator('.remote-viewport').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/mute-${width}.png` });
    await page.route('**/api/speak', route => route.fulfill({ status: 503, body: '{}' }));
    await play.click();
    await page.locator('.audio-failed').waitFor();
    assert.match(await page.locator('.instruction').textContent(), ml ? /MUTE/ : /MUTE/);
    assert.ok(await yes.isEnabled());
    await different.click();
    await button(ml ? 'ടിവി മോഡൽ വീണ്ടും പരിശോധിക്കുക' : 'Recheck my TV model').click();
    await page.getByRole('searchbox').fill('DEMO-TV-01-UNKNOWN');
    await page.getByRole('status').waitFor();
    assert.ok(requests.every(r => /\/api\/(health|speak)$/.test(r.url())));
    await page.getByRole('link', { name: ml ? 'എന്റെ റിമോട്ടിന്റെ ഫോട്ടോ ഉപയോഗിക്കുക' : 'Use my remote photo' }).click();
    await page.getByRole('checkbox').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('flow'), 'remote');
    assert.equal(new URL(page.url()).searchParams.get('lang'), locale);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px ${locale}: match, HDMI 2, measured overlays, playback/replay, text fallback, recovery and V2 entry`);
    await context.close();
  }
} finally {
  await browser.close();
}
