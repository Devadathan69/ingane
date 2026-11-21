// Real-browser smoke checks against a running preview (npm run build && npm run preview).
// Usage: node scripts/e2e-check.mjs [baseUrl]   — uses the locally installed Chrome.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const OUT = 'tmp/shots';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

for (const width of [360, 430]) {
  for (const [guide, steps] of [['practice-hdmi', 4], ['practice-unmute', 1]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}?guide=${guide}&lang=en`);
    await page.waitForSelector('[data-testid=hotspot]');
    const tag = `${guide}@${width}`;

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${tag} no horizontal overflow`, overflow <= 0, `${overflow}px`);

    const small = await page.$$eval('button, a', (els) =>
      els.filter((e) => e.offsetParent && (e.getBoundingClientRect().height < 48 || e.getBoundingClientRect().width < 48)).map((e) => e.textContent?.trim()),
    );
    check(`${tag} touch targets >= 48px`, small.length === 0, small.join(' | '));

    for (let i = 0; i < steps; i++) {
      const geo = await page.evaluate(() => {
        const img = document.querySelector('.remote-frame img').getBoundingClientRect();
        const r = document.querySelector('[data-testid=hotspot]').getBoundingClientRect();
        const vp = document.querySelector('.remote-viewport').getBoundingClientRect();
        return { img, r, vp };
      });
      const inside = geo.r.left >= geo.img.left - 4 && geo.r.right <= geo.img.right + 4 && geo.r.top >= geo.img.top - 4 && geo.r.bottom <= geo.img.bottom + 4;
      const cy = (geo.r.top + geo.r.bottom) / 2;
      const visible = cy >= geo.vp.top && cy <= geo.vp.bottom;
      check(`${tag} step ${i + 1} ring anchored to image & scrolled into view`, inside && visible);
      await page.screenshot({ path: `${OUT}/${tag}-step${i + 1}.png`, fullPage: true });
      await page.getByRole('button', { name: /I see it/ }).click();
    }
    check(`${tag} success after final confirm`, await page.getByRole('heading', { name: 'Done!' }).isVisible());
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// Flow, reload, language, keyboard, reduced motion, unknown id
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?guide=practice-hdmi`);
  check('default locale is Malayalam', (await page.getAttribute('html', 'lang')) === 'ml');
  await page.screenshot({ path: `${OUT}/practice-ml-step1.png`, fullPage: true });
  const anim = await page.$eval('[data-testid=hotspot]', (e) => getComputedStyle(e).animationName);
  check('reduced motion disables ring pulse', anim === 'none', anim);

  await page.getByRole('button', { name: 'ഇങ്ങനെ തന്നെ' }).click();
  await page.getByRole('button', { name: 'ഇങ്ങനെയല്ല' }).click();
  await page.screenshot({ path: `${OUT}/practice-ml-mismatch.png`, fullPage: true });
  check('mismatch stays on step 2', (await page.locator('h2').textContent()) === 'ഘട്ടം 2 / 4');
  check('mismatch hides advance control', (await page.getByRole('button', { name: 'ഇങ്ങനെ തന്നെ' }).count()) === 0);

  await page.getByRole('button', { name: 'English' }).click();
  check('language toggle keeps step + recovery', (await page.locator('h2').textContent()) === 'Step 2 of 4' && (await page.locator('.recovery').isVisible()));
  check('html lang updated', (await page.getAttribute('html', 'lang')) === 'en');

  await page.reload();
  check('hard reload keeps the deep link + language', (await page.locator('h1').textContent()) === 'Switch to HDMI 2');

  // Keyboard-only: Tab to "I see it" and press Enter
  await page.locator('body').focus();
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = (await page.evaluate(() => document.activeElement?.textContent ?? '')).includes('I see it');
  }
  check('keyboard can reach "I see it"', reached);
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check('focused control shows a visible outline', outline !== 'none', outline);
  await page.keyboard.press('Enter');
  check('Enter advances', (await page.locator('h2').textContent()) === 'Step 2 of 4');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => document.activeElement?.textContent ?? '')).includes('Back')) break;
  }
  await page.keyboard.press('Enter');
  check('keyboard Back works', (await page.locator('h2').textContent()) === 'Step 1 of 4', await page.evaluate(() => document.activeElement?.textContent));

  await page.goto(`${BASE}?guide=does-not-exist&lang=en`);
  check('unknown id shows error, no player', (await page.getByRole('alert').isVisible()) && (await page.locator('.player').count()) === 0);
  await page.screenshot({ path: `${OUT}/unknown.png`, fullPage: true });

  await page.route('**/devices/*.jpg', (r) => r.abort());
  await page.goto(`${BASE}?guide=practice-hdmi&lang=en`);
  await page.waitForSelector('.image-failed');
  check('image failure keeps text guide usable, no orphan ring', (await page.locator('[data-testid=hotspot]').count()) === 0 && (await page.getByRole('button', { name: /I see it/ }).isVisible()));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
