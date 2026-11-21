// Run against the local client. Only the availability probe is allowed during this rehearsal.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
mkdirSync('tmp', { recursive: true });
const output = mkdtempSync(join('tmp', 'press-rehearsal-'));
const browser = await chromium.launch({ channel: 'chrome' });
const boxes = { input: [123,170,67,48], down: [137,880,42,66], ok: [132,819,51,50] };
const confirm = p => p.locator('.btn-yes');
const frames = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function pageFor(width, height, locale, motion = 'no-preference', holdLift = false) {
  const p = await browser.newPage({ viewport: { width, height }, hasTouch: width < 760, reducedMotion: motion });
  const calls = [], errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/api/**', r => { calls.push(new URL(r.request().url()).pathname); return r.abort(); });
  await p.addInitScript(hold => {
    window.photoLifts = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const effect = animate.apply(this, args);
      if (this.classList.contains('remote-frame')) {
        window.photoLifts.push(effect);
        if (hold) { effect.pause(); effect.currentTime = 220; }
      }
      return effect;
    };
  }, holdLift);
  await p.goto(new URL('?flow=presets&demo=hdmi-2&lang=' + locale, base).href);
  return { p, check: () => { assert.deepEqual(errors, []); assert.deepEqual(calls, ['/api/health']); } };
}

async function contact(p, control) {
  await p.locator('.press-hand').waitFor({ state: 'attached' });
  const result = await p.evaluate(box => {
    const photo = document.querySelector('.remote-frame img').getBoundingClientRect();
    const stage = document.querySelector('.remote-viewport').getBoundingClientRect();
    const travel = document.querySelector('.press-travel');
    const animations = travel.parentElement.parentElement.getAnimations({ subtree: true });
    const gesture = animations.find(a => a.animationName === 'demonstrate-press');
    if (!gesture) throw new Error('Missing hand gesture');
    for (const a of animations) if (a instanceof CSSAnimation) {
      a.pause(); a.currentTime = a.effect.getTiming().duration * .56;
    }
    const hand = travel.querySelector('svg');
    const tip = new DOMPoint(0, 0).matrixTransform(hand.getScreenCTM());
    const ring = document.querySelector('.press-outline').getBoundingClientRect();
    const [x,y,w,h] = box;
    const target = [photo.x + (x + w / 2) * photo.width /315, photo.y + (y + h / 2) * photo.height /1365];
    return {
      error: Math.max(Math.abs(tip.x-target[0]), Math.abs(tip.y-target[1]),
        Math.abs(ring.x-photo.x-x*photo.width/315), Math.abs(ring.y-photo.y-y*photo.height/1365),
        Math.abs(ring.width-w*photo.width/315), Math.abs(ring.height-h*photo.height/1365)),
      inStage: ring.top >= stage.top && ring.bottom <= stage.bottom && ring.left >= stage.left && ring.right <= stage.right,
      opacity: getComputedStyle(travel).opacity, pointer: getComputedStyle(hand).pointerEvents,
      faceOn: getComputedStyle(travel.closest('.remote-frame')).transform,
    };
  }, boxes[control]);
  assert.ok(result.error < .8, control + ' error: ' + result.error + ' CSS pixels');
  assert.ok(result.inStage); assert.equal(result.opacity, '1'); assert.equal(result.pointer, 'none');
  assert.equal(result.faceOn, 'none');
  return result.error;
}

try {
  for (const [width, height, locale] of [[360,800,'ml'], [430,820,'en'], [1280,850,'en']]) {
    const p = await browser.newPage({ viewport: { width, height } });
    await p.goto(new URL('?lang=' + locale, base).href);
    await p.locator('.capture-primary').waitFor();
    await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.locator('.picker .route-card').count(), 2);
    assert.equal(await p.locator('.picker .press-hand, .picker .ring').count(), 0);
    assert.deepEqual(await p.locator('.route-card').evaluateAll(links => links.map(a => new URL(a.href).searchParams.get('flow'))), ['presets','family']);
    assert.ok(await p.locator('.home-example .example-remote').isVisible());
    assert.ok(await p.locator('.home-example figcaption').isVisible());
    assert.ok(await p.locator('.picker').evaluate(el => el.querySelector('button')?.classList.contains('capture-primary')));
    assert.ok(await p.locator('.picker').evaluate(el => [...el.querySelectorAll('a,button')].every(b => b.getBoundingClientRect().height >= 48)));
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await p.screenshot({ path: join(output, 'picker-' + width + '.png'), fullPage: true });
    await p.locator('.practice-link').focus(); await p.keyboard.press('Enter');
    await p.locator('.btn-yes').waitFor();
    assert.equal(new URL(p.url()).searchParams.get('demo'), 'hdmi-2');
    assert.equal(new URL(p.url()).searchParams.get('lang'), locale);
    await p.close();
  }
  console.log('PASS photo-first picker, native language selection, two secondary routes and keyboard demo entry');
  for (const [width, height, locale] of [[360,800,'en'], [430,820,'ml'], [1280,850,'en']]) {
    const { p, check } = await pageFor(width, height, locale, 'no-preference', true);
    await p.waitForFunction(() => window.photoLifts.length > 0);
    assert.equal(await p.locator('.press-outline,.press-hand').count(), 0);
    assert.ok(await confirm(p).isEnabled());
    if (width === 360) {
      const overview = await p.evaluate(() => {
        const a = window.photoLifts.at(-1);
        a.currentTime = a.effect.getTiming().duration * .52;
        const image = document.querySelector('.remote-frame img').getBoundingClientRect(), vp = document.querySelector('.remote-viewport').getBoundingClientRect();
        return image.top >= vp.top && image.bottom <= vp.bottom && image.left >= vp.left && image.right <= vp.right;
      });
      assert.ok(overview, 'The whole practice remote must be visible on entry');
      await p.screenshot({ path: join(output, 'overview-360.png') });
    }
    await p.evaluate(() => window.photoLifts.at(-1).finish());
    let error = await contact(p, 'input');
    await p.screenshot({ path: join(output, 'contact-' + width + '.png') });
    const primary = await confirm(p).boundingBox(), different = await p.locator('.btn-no').boundingBox();
    assert.ok(primary.y + primary.height <= height && different.y + different.height <= height, 'Primary actions outside first viewport');
    assert.equal(await p.locator('.btn-listen').count(), 0);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width < 760) {
      assert.ok(await p.evaluate(() => {
        const stage = document.querySelector('.remote-viewport').getBoundingClientRect(), photo = document.querySelector('.remote-frame img').getBoundingClientRect();
        return photo.x > stage.x + 15 && photo.right < stage.right - 15 && photo.top >= stage.top && photo.bottom <= stage.bottom;
      }), 'Full portrait photo must be letterboxed');
      await p.setViewportSize({ width: height, height: width });
      await frames(p); error = Math.max(error, await contact(p, 'input'));
      await p.setViewportSize({ width, height }); await frames(p);
    }
    const fullWidth = (await p.locator('.remote-frame img').boundingBox()).width;
    await p.locator('.stage-view').click();
    error = Math.max(error, await contact(p, 'input'));
    assert.ok((await p.locator('.remote-frame img').boundingBox()).width > fullWidth * 1.5, 'Button detail must magnify the actual photo');
    await p.locator('.stage-view').click();
    await p.evaluate(() => { window.previousHand = document.querySelector('.press-travel'); });
    await p.locator('.stage-replay').click();
    await p.locator('.stage-replay').click();
    await confirm(p).click();
    assert.ok(await p.evaluate(() => !window.previousHand.isConnected));
    error = Math.max(error, await contact(p, 'down'));
    if (width === 360) await p.screenshot({ path: join(output, 'down-360.png') });
    await p.locator('.nav-row button').first().click();
    assert.equal(await p.locator('.step-count').innerText(), locale === 'en' ? 'Step 1 of 4' : 'ഘട്ടം 1 / 4');
    await confirm(p).click(); await confirm(p).click();
    error = Math.max(error, await contact(p, 'down'));
    await p.locator('.btn-no').click();
    assert.equal(await p.locator('.press-hand,.btn-yes').count(), 0);
    await p.locator('.recovery .btn-primary').click();
    await confirm(p).click();
    error = Math.max(error, await contact(p, 'ok'));
    if (width === 360) await p.screenshot({ path: join(output, 'ok-360.png') });
    await p.locator('.stage-replay').click();
    await p.waitForFunction(() => {
      const el = document.querySelector('.press-travel'), effect = el?.getAnimations()[0];
      return effect?.playState === 'finished' && getComputedStyle(el).opacity === '0';
    });
    assert.equal(await p.locator('.press-outline').count(), 1);
    assert.match(await p.locator('.instruction').innerText(), /HDMI 2/);
    await confirm(p).click(); await p.locator('.done').waitFor();
    await p.locator('.done .nav-row button').last().click(); await contact(p, 'input');
    assert.equal(await p.evaluate(() => window.photoLifts.length), 1);
    check(); await p.close();
    console.log('PASS ' + width + 'px ' + locale + ': lift, replay, manual progress, registration to Input/Down/OK; max error ' + error.toFixed(3) + 'px');
  }
  const { p, check } = await pageFor(360, 800, 'en', 'reduce');
  await p.locator('.press-outline').waitFor();
  assert.equal(await p.locator('.press-hand').count(), 0);
  assert.equal(await p.evaluate(() => window.photoLifts.length), 0);
  assert.equal(await p.locator('.remote-frame').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
  await p.getByRole('button', { name: 'Find the button' }).click();
  await p.screenshot({ path: join(output, 'reduced-360.png') });
  await confirm(p).click(); assert.equal(await p.locator('.press-hand').count(), 0);
  check(); await p.close();
  const early = await pageFor(360, 800, 'en', 'no-preference', true);
  await early.p.waitForFunction(() => window.photoLifts.length > 0);
  await confirm(early.p).click();
  await contact(early.p, 'down');
  assert.equal(await early.p.evaluate(() => window.photoLifts[0].playState), 'idle');
  early.check(); await early.p.close();
  console.log('PASS reduced motion and text-only playback. Viewport screenshots in ' + output);
} finally {
  await browser.close();
}
