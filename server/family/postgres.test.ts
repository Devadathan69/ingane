// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import type { FamilyGuide } from '../../shared/family';
import { PgFamilyStore } from './postgres';
import { familyRoutes } from './routes';
import { digest } from './store';
import { makeFamilySnapshot } from '../../shared/family';

const db = new PGlite();
const query = async (sql: string, args: unknown[] = []) => {
  const r = await db.query(sql,args);
  return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
};
const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
const store = new PgFamilyStore(pool);
const alice = randomBytes(32).toString('base64url'), bob = randomBytes(32).toString('base64url');
const api = familyRoutes({ store, uploads: store, creators: new Map([[digest(alice),'alice'],[digest(bob),'bob']]), speech: null });
function createFamily() {
  const guide: FamilyGuide = { version:1,title:'Amma, HDMI 2',locale:'ml',nickname:'Amma',before:'',demo:true,
    image:{width:315,height:1365}, controls:[{id:'source',label:'SOURCE',box:{x:.2,y:.1,w:.1,h:.04}}],
    steps:[{id:'one',kind:'button',controlId:'source',instruction:'SOURCE അമർത്തൂ.',expected:'ഇൻപുട്ട് പട്ടിക കാണുന്നുണ്ടോ?',
      recovery:'പട്ടിക പരിശോധിക്കുക.',screenLabel:'',audioLocale:'ml',audioReview:{instruction:'SOURCE അമർത്തൂ.',screenLabel:''}}] };
  const photo = readFileSync(new URL('../../hosting/media/coolux-practice.jpg',import.meta.url));
  const clip = Buffer.alloc(44 + 3200);
  clip.write('RIFF'); clip.writeUInt32LE(clip.length-8,4); clip.write('WAVEfmt ',8); clip.writeUInt32LE(16,16);
  clip.writeUInt16LE(1,20); clip.writeUInt16LE(1,22); clip.writeUInt32LE(16000,24); clip.writeUInt32LE(32000,28);
  clip.writeUInt16LE(2,32); clip.writeUInt16LE(16,34); clip.write('data',36); clip.writeUInt32LE(clip.length-44,40);
  return {guide,photo,clip};
}

const { guide, photo, clip } = createFamily();
const snapshot = makeFamilySnapshot(guide,true);
beforeAll(async () => { await db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8')); });
afterAll(() => db.close());

function owner(path: string,key: string, method = 'POST', body?: BodyInit, headers: Record<string,string> = {}) {
  return api.request('/owner/' + path,{method, headers:{Authorization:'Bearer ' + key,...headers},body});
}
const media = (token: string, part: string) => api.request('/' + part,{headers:{Authorization:'Bearer ' + token}});
const json = { 'Content-Type':'application/json' };

it('publishes privately only after all validated media arrive and retires guide, photo and audio together', async () => {
  const id = randomBytes(16).toString('hex');
  const start = (revision: number) => owner('upload/begin',alice,'POST',JSON.stringify({id,revision,permission:true,guide}),json);
  const started = await start(0);
  expect(started.status).toBe(201);
  const {batch} = await started.json();
  const headers = {'X-Family-Upload':batch};
  const write = (key: string, part:string, bytes: Buffer, mime:string) =>
    owner('upload/media',key,'PUT',new Uint8Array(bytes),{...headers,'X-Family-Part':part,'Content-Type':mime});
  expect((await write(bob,'photo',photo,'image/jpeg')).status).toBe(404);
  expect((await write(alice,'photo',photo,'image/jpeg')).status).toBe(204);
  expect((await owner('upload/finish',alice,'POST',undefined,headers)).status).toBe(422);
  expect((await write(alice,'clip-one',Buffer.from('bad'),'audio/wav')).status).toBe(422);
  expect((await write(alice,'clip-one',clip,'audio/wav')).status).toBe(204);
  const published = await owner('upload/finish',alice,'POST',undefined,headers);
  expect(published.status).toBe(201);
  const first = await published.json();
  for (const path of ['view','photo','clip/one']) {
    const response = await media(first.token,path);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
  }
  expect((await write(alice,'clip-one',clip,'audio/wav')).status).toBe(404);
  expect((await owner('revoke',bob,'POST',JSON.stringify({id,revision:1}),json)).status).toBe(404);
  const nextSnapshot = {...snapshot,title:'A new title'};
  const next = await store.publish('alice',id,1,nextSnapshot,photo,new Map([['one',clip]]));
  expect(await store.read(next.token,'snapshot')).toContain('A new title');
  for (const path of ['view','photo','clip/one']) expect((await media(first.token,path)).status).toBe(404);
  await store.revoke('alice',id,next.revision);
  for (const path of ['view','photo','clip/one']) expect((await media(next.token,path)).status).toBe(404);
  expect((await store.list('alice')).find(r=>r.id===id)).toMatchObject({active:false,revision:3});
}, 20_000);

it('checks expiration on each read before housekeeping and keeps another creator’s staged upload private', async () => {
  const id = randomBytes(16).toString('hex');
  const active = await store.publish('alice',id,0,snapshot,photo,new Map([['one',clip]]));
  const staged = await store.begin('alice',id,1,snapshot);
  await expect(store.pending('bob',staged)).rejects.toThrow();
  expect(JSON.parse(String(await store.read(active.token,'snapshot'))).title).toBe(guide.title);
  await db.query("UPDATE family_link SET expires=now()-interval '1 second' WHERE id=$1",[id]);
  for (const path of ['view','photo','clip/one']) expect((await media(active.token,path)).status).toBe(404);
  await store.discard('alice',staged);
  await expect(store.pending('alice',staged)).rejects.toThrow();
  expect((await db.query('SELECT token_hash FROM family_link WHERE id=$1',[id])).rows[0]).toEqual({token_hash:digest(active.token)});
});

it('shares a narrated guide larger than one hosting request by uploading each clip separately', async () => {
  const g = structuredClone(guide), id = randomBytes(16).toString('hex');
  const audio = Buffer.alloc(44 + 15 * 16000 * 2);
  clip.copy(audio,0,0,44);
  audio.writeUInt32LE(audio.length-8,4); audio.writeUInt32LE(audio.length-44,40);
  g.steps = Array.from({length:11},(_,i) => ({...g.steps[0],id:'step-'+i}));
  expect(audio.length*g.steps.length).toBeGreaterThan(4.5*1024*1024);
  const begin = await owner('upload/begin',bob,'POST',JSON.stringify({id,revision:0,permission:true,guide:g}),json);
  const {batch} = await begin.json();
  const headers = {'X-Family-Upload':batch};
  const put = (part:string,bytes:Buffer,mime:string) => owner('upload/media',bob,'PUT',new Uint8Array(bytes),
    {...headers,'X-Family-Part':part,'Content-Type':mime});
  expect((await put('photo',photo,'image/jpeg')).status).toBe(204);
  for (const step of g.steps) expect((await put('clip-'+step.id,audio,'audio/wav')).status).toBe(204);
  const done = await owner('upload/finish',bob,'POST',undefined,headers);
  expect(done.status).toBe(201);
  const shared = await done.json();
  expect((await (await media(shared.token,'clip/step-10')).arrayBuffer()).byteLength).toBe(audio.length);
  await store.revoke('bob',id,shared.revision);
},20_000);
