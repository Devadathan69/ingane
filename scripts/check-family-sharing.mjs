// Runs against the sanitized build and a disposable Postgres engine, or the hosted app with --live.
// The live check uses only Ingane's licensed photo, creates test passkeys, and revokes its test link.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const live = process.argv.includes('--live');
const target = process.argv[2];
if (!target || (live ? target !== 'https://ingane.vercel.app/' : /^https?:/.test(target))) throw new Error('Pass the local public build directory or https://ingane.vercel.app/ --live.');
let base, server, database, browser, creator, active, draftID, revision = 0;
let stage = 'starting';
const testOwners = [];
const btn = (p,name) => p.getByRole('button',{name,exact:true});
const title = 'Amma · family guide check';
if (live) mkdirSync('tmp',{recursive:true});
const qa = live ? mkdtempSync(resolve('tmp/family-live-')) : null;
async function localSite(folder) {
  const [{PGlite}, {Hono}, {serve}, {serveStatic}, {PgFamilyStore}, {CreatorAuth}, {familyRoutes}] = await Promise.all([
    import('@electric-sql/pglite'), import('hono'), import('@hono/node-server'), import('@hono/node-server/serve-static'),
    import('../server/family/postgres.ts'), import('../server/family/passkeys.ts'), import('../server/family/routes.ts'),
  ]);
  database = new PGlite();
  await database.exec(readFileSync('server/family/schema.sql','utf8'));
  // PGlite uses a single connection. Keep test transactions together just as pg does with a checked-out client.
  let last = Promise.resolve();
  const lock = async () => { const previous=last; let release; last=new Promise(done=>{release=done;}); await previous; return release; };
  const query = async (sql,args=[]) => { const r=await database.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows||r.rows.length}; };
  const pool = {
    query: async (...args) => { const release=await lock();try{return await query(...args);}finally{release();} },
    connect: async () => ({ query,release:await lock() }),
  };
  const store = new PgFamilyStore(pool), app = new Hono();
  server = serve({fetch: app.fetch,hostname:'127.0.0.1',port:0});
  await new Promise(done=>server.once('listening',done));
  const origin='http://localhost:'+server.address().port;
  app.route('/api/family',familyRoutes({store,uploads:store,creators:new Map(),speech:null,
    auth:new CreatorAuth(store,origin,randomBytes(32).toString('hex'))}));
  const api=(await import(pathToFileURL(join(folder,'api/index.mjs')).href)).default;
  app.all('/api/*',c=>api.fetch(c.req.raw));
  app.use('/*',serveStatic({root:join(folder,'dist')}));
  return origin+'/';
}
async function passkeyPage(width=390) {
  const context=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
  const p=await context.newPage(), cdp=await context.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,
    hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await p.goto(base+'?flow=family&lang=en');
  const options=p.waitForResponse(r=>r.url().endsWith('/auth/options/register'));
  const finished=p.waitForResponse(r=>r.url().endsWith('/auth/finish/register'));
  await btn(p,'Create a creator passkey').click();
  const owner=Buffer.from((await (await options).json()).user.id,'base64url').toString('hex');
  assert.match(owner,/^[a-f0-9]{32}$/);
  testOwners.push(owner);
  if(qa) writeFileSync(join(qa,'fixture-owners.json'),JSON.stringify(testOwners));
  assert.equal((await finished).status(),200,'Passkey registration');
  await btn(p,'Sign out').waitFor();
  return p;
}
async function requestFrom(page,path,params) {
  return page.evaluate(async ([path,params])=>{
    const options=params ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)} : {};
    const r=await fetch('api/family/'+path,options);
    return {status:r.status,data:await r.json()};
  },[path,params]);
}
async function recipientRead(page,token,part) {
  return page.evaluate(async ([token,part])=>{
    const read=async()=>{
      const r=await fetch('api/family/'+part,{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20_000)});
      const mime=r.headers.get('content-type'), policy=r.headers.get('cache-control');
      if(mime?.includes('json')) return {status:r.status,mime,policy,json:await r.json()};
      const bytes=new Uint8Array(await r.arrayBuffer());
      return {status:r.status,mime,policy,length:bytes.length,wav:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WAVE'};
    };
    try {return await read();} catch {return read();}
  },[token,part]);
}
async function assertView(page,token,status,step) {
  for(const path of ['view','photo',...(step?['clip/'+encodeURIComponent(step)]:[])]) {
    const res=await recipientRead(page,token,path);
    assert.equal(res.status,status,'Private '+path.split('/')[0]+' status');assert.match(res.policy,/no-store/);
  }
}
async function seedGuide(p) {
  if (!live) {
    await p.getByRole('link',{name:'Start from a ready-made guide'}).click();
    await btn(p,'Try the demo').click(); await btn(p,'Ingane Demo').click();
    await p.getByRole('button',{name:/DEMO-TV-01/}).click();
    await p.getByRole('button',{name:/My remote matches/}).click();
    await p.getByLabel('Task',{exact:true}).selectOption('demo-hdmi');
    await p.getByLabel(/Which HDMI port/).selectOption('HDMI 2');
    await p.getByLabel('Guide language',{exact:true}).selectOption('ml');
  } else {
    await p.getByRole('link',{name:'Make a guide with AI'}).click();
    const photo=readFileSync('hosting/media/coolux-practice.jpg');
    await p.getByTestId('gallery-input').setInputFiles({name:'practice.jpg',mimeType:'image/jpeg',buffer:photo});
    await p.getByRole('button',{name:/Use this photo|Use it anyway/}).click();
    await p.getByLabel('Which language should I guide you in?').selectOption('ml');
    await p.getByRole('checkbox').check(); await p.getByRole('textbox').fill('ടിവിയിലെ മ്യൂട്ട് മാറ്റണം.');
    const guide=()=>p.waitForResponse(r=>r.url().endsWith('/api/guide'),{timeout:130_000});
    let response=guide();await btn(p,'Make my guide').click();
    let result=await (await response).json();
    if(result.clarification?.kind==='confirm_button'){
      const c=result.observedControls.find(c=>c.id===result.clarification.controlId);
      assert.equal(c?.role,'mute');
      const cx=(c.bbox.x+c.bbox.w/2)*315,cy=(c.bbox.y+c.bbox.h/2)*1365;
      assert.ok(cx>=131&&cx<=183&&cy>=486&&cy<=549,'Confirmation over the printed MUTE key');
      response=guide();await p.getByRole('button',{name:/Yes.*button/i}).click();result=await (await response).json();
    }
    assert.equal(result.status,'ready','Live photo guide');assert.equal(result.demo,false);
    await p.getByTestId('hotspot').waitFor();
  }
  await btn(p,'Make a copy for family').click();
  await p.getByLabel('Guide title',{exact:true}).fill(title);
}
try {
  base=live?target:await localSite(resolve(target));
  const health=await (await fetch(base+'api/family/status')).json();assert.ok(health.sharing && health.passkeys);
  if(live) assert.equal(health.sarvam,true);
  browser=await chromium.launch({channel:'chrome'});
  creator=await passkeyPage();
  stage='generating the source guide';
  await seedGuide(creator);
  console.log('PASS creator registration and source guide.');
  await btn(creator,'Sign out').waitFor(); // Navigation restored the server session.
  if(live){
    stage='generating step narration';
    await btn(creator,'Add AI narration').click();
    await creator.getByText('Every step has narration.',{exact:true}).waitFor({timeout:90_000});
    console.log('PASS saved Sarvam narration for each step.');
  }
  await btn(creator,'Save draft').click();await creator.getByText('Draft saved on this device.').waitFor();
  await btn(creator,'Preview guide').click();await creator.getByTestId('hotspot').waitFor();
  assert.match(await creator.locator('.instruction').innerText(),/\p{Script=Malayalam}/u);
  await btn(creator,'Back to editor').click();
  stage='publishing a read-only copy';
  await btn(creator,'Share link').click();await creator.getByRole('checkbox').check();
  const began=creator.waitForRequest(r=>r.url().endsWith('/owner/upload/begin'));
  await btn(creator,'Create read-only link').click();
  draftID=(await began).postDataJSON().id;
  const link=creator.getByRole('textbox',{name:'Share link',exact:true});await link.waitFor();
  active=await link.inputValue();revision=1;
  const first=new URL(active).hash.slice(1);
  const whatsapp=new URL(await creator.getByRole('link',{name:'Share on WhatsApp'}).getAttribute('href'));
  assert.ok(whatsapp.origin==='https://wa.me'&&whatsapp.searchParams.get('text')===active,'WhatsApp handoff contains the recipient link');
  const parentContext=await browser.newContext({viewport:{width:430,height:850},reducedMotion:'reduce'});
  const parent=await parentContext.newPage();
  let requestedAudio=0;parent.on('request',r=>{if(r.url().includes('/api/family/clip/'))requestedAudio++;});
  await parent.goto(active);
  stage='opening the signed-out guide';
  await parent.getByRole('heading',{name:title}).waitFor();
  assert.equal((await parentContext.cookies()).filter(c=>c.name.includes('creator')).length,0);
  const snapshot=(await recipientRead(parent,first,'view')).json;
  assert.equal(snapshot.locale,'ml');assert.ok(snapshot.steps.length>0);assert.equal(snapshot.owner,undefined);
  assert.equal(requestedAudio,0,'Audio is tap-to-play');
  const step=live?snapshot.steps[0].id:null;
  for(const item of snapshot.steps) {
    stage='playing a recipient step';
    if(item.hotspot) await parent.getByTestId('hotspot').waitFor();
    assert.equal(await parent.locator('.instruction').innerText(),item.instruction);
    if(live){
      assert.equal(item.hasAudio,true);
      const clip=parent.waitForResponse(r=>r.url().includes('/api/family/clip/'));
      await parent.locator('.btn-listen').click();
      const res=await clip; assert.equal(res.status(),200);
      assert.match(res.headers()['content-type'] ?? '',/^audio\/wav/);
      // Chrome can consume fetch-to-Blob responses before DevTools exposes a body. Read the
      // protected file independently, then verify that the recipient's player actually played it.
      const file=await recipientRead(parent,first,'clip/'+encodeURIComponent(item.id));
      assert.ok(file.length>1000 && file.wav, 'Expected a playable WAV; got HTTP '+file.status+', '+file.mime+', '+file.length+' bytes');
      await btn(parent,'വീണ്ടും കേൾക്കാം').waitFor();
    }
    await parent.locator('.btn-yes').click();
  }
  await parent.locator('.done').waitFor();
  console.log('PASS signed-out mobile reader, '+snapshot.steps.length+' Malayalam steps, '+(live?'live photo guide and saved Sarvam audio':'offline HDMI 2 practice')+', WhatsApp handoff.');
  stage='checking ownership and replacing the copy';
  const other=await passkeyPage(360);
  assert.equal((await requestFrom(other,'owner/links')).data.links.length,0);
  assert.equal((await requestFrom(other,'owner/revoke',{id:draftID,revision})).status,404);
  await assertView(parent,first,200,step);
  await creator.getByLabel('Guide title',{exact:true}).fill(title+' revised');
  assert.equal((await recipientRead(parent,first,'view')).json.title,title);
  await btn(creator,'Replace shared copy and revoke old link').click();await creator.getByRole('checkbox').check();
  const replaced=creator.waitForResponse(r=>r.url().endsWith('/owner/upload/finish'));
  await btn(creator,'Revoke old link and create replacement').click();
  const replacement=await (await replaced).json();revision=replacement.revision;
  assert.equal(revision,2);assert.ok(replacement.token!==first);await assertView(parent,first,404,step);
  await assertView(parent,replacement.token,200,step);
  stage='signing back in and stopping sharing';
  await btn(creator,'Sign out').click();await btn(creator,'Sign in with a passkey').click();await btn(creator,'Sign out').waitFor();
  await btn(creator,'Stop sharing').click();await btn(creator,'Stop sharing').click();
  await creator.getByText('Sharing stopped.',{exact:true}).waitFor();active=null;
  await assertView(parent,replacement.token,404,step);
  await parent.reload();await parent.getByRole('heading',{name:/unavailable|ലഭ്യമല്ല/}).waitFor();
  await assertView(parent,randomBytes(32).toString('base64url'),404,step);
  await btn(creator,'Sign out').click();await btn(other,'Sign out').click();
  console.log('PASS new creator and returning passkey, ownership, draft isolation, replacement, revoked guide and media, unavailable screen.');
} catch (e) {
  console.error(stage + ': ' + String(e.message).replace(/[A-Za-z0-9_-]{43,}/g,'[private value]'));
  process.exitCode=1;
} finally {
  if(creator && active && draftID) await requestFrom(creator,'owner/revoke',{id:draftID,revision}).catch(()=>{});
  await browser?.close();
  if(server) await new Promise(done=>server.close(done));
  await database?.close();
  if(qa) console.log('Test-account cleanup identifiers saved in '+qa);
}
