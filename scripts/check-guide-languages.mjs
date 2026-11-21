// Opt-in live smoke test. Uses API credit and only a drawn remote and synthetic speech.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';

const cases = [
  ['hi', 'मुझे टीवी की HOME स्क्रीन खोलनी है।', /\p{Script=Devanagari}/u],
  ['ta', 'டிவியின் HOME திரையைத் திறக்க வேண்டும்.', /\p{Script=Tamil}/u],
  ['kn', 'ಟಿವಿಯ HOME ಪರದೆಯನ್ನು ತೆರೆಯಬೇಕು.', /\p{Script=Kannada}/u],
  ['te', 'నాకు టీవీలో HOME తెర తెరవాలి.', /\p{Script=Telugu}/u],
];
const config = loadConfig();
assert.ok(existsSync('dist/index.html'), 'Build the app first.');
assert.ok(config.guide?.name === 'live' && config.speech?.name === 'live', 'Configure the live guide and speech services first.');
const browser = await chromium.launch({ channel: 'chrome' });
const app = createApp({ config });
app.use('/*', serveStatic({ root: './dist' }));
const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });

async function drawRemote(page) {
  const src = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 520; canvas.height = 860;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e7e5da'; ctx.fillRect(0, 0, 520, 860);
    const box = (x, y, w, h, radius, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x,y,w,h,radius); ctx.fill();
    };
    box(111,28,298,802,60,'#202623');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 36px Arial';
    for (const [y,label] of [[129,'POWER'],[276,'HOME'],[426,'MUTE'],[575,'VOL +']]) {
      box(163,y,194,74,22,label === 'POWER' ? '#9f322e' : '#49544b');
      ctx.fillStyle = 'white'; ctx.fillText(label,260,y+37);
    }
    ctx.font = '24px Arial'; ctx.fillText('TV REMOTE',260,745);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  return { name: 'synthetic-remote.jpg', mimeType:'image/jpeg', buffer: Buffer.from(src,'base64') };
}

function installAudioProbe(command) {
  window.guideTest = { commandEnded:false, played:false, ended:false };
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext();
    await context.resume();
    const sound = context.createBufferSource();
    const bytes = Uint8Array.from(atob(command), c => c.charCodeAt(0));
    sound.buffer = await context.decodeAudioData(bytes.buffer);
    const microphone = context.createMediaStreamDestination();
    sound.connect(microphone);
    sound.onended = () => { window.guideTest.commandEnded = true; };
    sound.start(context.currentTime + .4);
    return microphone.stream;
  };
  window.Audio = class extends window.Audio {
    constructor(src) {
      super(src);
      window.guideTest.clip = this;
      this.addEventListener('playing', () => { window.guideTest.played = true; });
      this.addEventListener('ended', () => { window.guideTest.ended = true; });
    }
  };
}

async function testLanguage(page, base, locale, command, script, photo) {
  const audio = await config.speech.synthesize(command,locale,AbortSignal.timeout(30_000));
  await page.addInitScript(installAudioProbe, audio.toString('base64'));
  await page.goto(base + '?lang=en');
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Choose from gallery',exact:true}).click();
  await (await choose).setFiles(photo);
  await page.getByRole('button',{name:/Use this photo|Use anyway/}).click();
  await page.getByLabel('Which language should I guide you in?').selectOption(locale);
  await page.getByRole('checkbox').check();
  await page.locator('.btn-mic').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.guideTest.commandEnded);
  const transcribed = page.waitForResponse(r => r.url().endsWith('/api/transcribe'));
  await page.keyboard.press('Enter');
  assert.equal((await transcribed).status(),200);
  const field = page.getByRole('textbox');
  await page.waitForFunction(() => document.querySelector('textarea')?.value.trim());
  const transcript = await field.inputValue();
  assert.ok(script.test(transcript), 'Transcript needs native script');
  const reviewed = /\bhome\b/i.test(transcript) ? transcript.replace(/\bhome\b/ig,'HOME') : transcript + ' (HOME)';
  await field.fill(reviewed);
  const guideResponse = () => page.waitForResponse(r => r.url().endsWith('/api/guide'),{timeout:130_000});
  const waiting = guideResponse();
  await page.getByRole('button',{name:'Make my guide'}).click();
  const guide = async (response) => { assert.equal(response.status(),200); return response.json(); };
  let result = await guide(await waiting);
  const onHome = control => control?.role === 'home' &&
    Math.abs(control.bbox.x + control.bbox.w/2 - .5) < .17 && Math.abs(control.bbox.y + control.bbox.h/2 - 313/860) < .055;
  if (result.clarification?.kind === 'confirm_button') {
    assert.ok(onHome(result.observedControls.find(c=>c.id===result.clarification.controlId)));
    const next = guideResponse();
    await page.getByRole('button',{name:'Yes, that’s the button'}).click();
    result = await guide(await next);
  }
  assert.equal(result.status,'ready'); assert.equal(result.locale,locale); assert.equal(result.demo,false);
  assert.ok(onHome(result.observedControls.find(c=>c.id===result.steps[0].controlId)));
  await page.getByTestId('hotspot').waitFor();
  const instruction = await page.locator('.instruction').innerText();
  assert.ok(script.test(instruction) && instruction.includes('HOME'), 'Check the printed HOME label and the instruction language');
  assert.equal(await page.evaluate(()=>window.guideTest.played),false);
  await page.locator('.btn-listen').click();
  await page.waitForFunction(()=>window.guideTest.ended,undefined,{timeout:40_000});
  const seconds = await page.evaluate(async () => {
    const bytes = await (await fetch(window.guideTest.clip.src)).arrayBuffer();
    const context = new AudioContext();
    try {
      const sound = await context.decodeAudioData(bytes), pcm = sound.getChannelData(0);
      let energy = 0; for (const sample of pcm) energy += sample * sample;
      if (!window.guideTest.played || Math.sqrt(energy / pcm.length) < .001) throw new Error('Silent audio');
      return sound.duration;
    } finally { await context.close(); }
  });
  assert.ok(seconds > .25);
  console.log('PASS',locale,'synthetic voice input, editable transcript, HOME highlight and tap-to-play narration',seconds.toFixed(1)+'s',
    reviewed === transcript ? '(HOME retained)' : '(HOME spelling reviewed)');
}

try {
  if (!server.listening) await once(server,'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const canvas = await browser.newPage();
  const photo = await drawRemote(canvas); await canvas.close();
  for (const [locale,command,script] of cases) {
    const page = await browser.newPage({ viewport:{width:390,height:844}, reducedMotion:'reduce' });
    try { await testLanguage(page,base,locale,command,script,photo); }
    catch (err) { console.error('FAIL',locale,err.name); process.exitCode=1; }
    finally { await page.close(); }
  }
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
