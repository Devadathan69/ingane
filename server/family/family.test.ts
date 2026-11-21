// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { familyIssues, makeFamilySnapshot, type FamilyGuide } from '../../shared/family';
import { silentWav } from '../providers/mock';
import { familyConfig } from './config';
import { privatePhoto, privateAudio } from './media';
import { familyRoutes } from './routes';
import { digest, FamilyStore, SHARE_LIFETIME } from './store';

const photo = readFileSync(new URL('../../public/devices/coolux-practice.jpg', import.meta.url));
const guide: FamilyGuide = { version: 1, locale: 'ml', title: 'Amma, switch to HDMI 2', nickname: 'അമ്മ', demo: true, before: '',
  image: { width: 315, height: 1365 }, controls: [
    { id: 'input', label: 'ഇൻപുട്ട്', box: { x: 123 / 315, y: 170 / 1365, w: 67 / 315, h: 48 / 1365 } },
    { id: 'unused', label: 'draft-only control', box: { x: .1, y: .1, w: .1, h: .1 } },
  ], steps: [{ id: 'one', kind: 'button', controlId: 'input', screenLabel: 'HDMI 2', instruction: 'ഇൻപുട്ട് അമർത്തുക.',
    expected: 'ലിസ്റ്റ് കാണുന്നുണ്ടോ?', recovery: 'റിമോട്ട് വീണ്ടും നോക്കുക.', audioLocale: 'ml' }],
};
const id = 'f'.repeat(32);
const key = () => randomBytes(32).toString('base64url');
function setup() {
  const db = new DatabaseSync(':memory:'); let time = 1000;
  const alice = key(), bob = key(), store = new FamilyStore(db, () => time);
  const app = familyRoutes({ store, speech: null, creators: new Map([[digest(alice), 'creator-a'], [digest(bob), 'creator-b']]) });
  const call = (path: string, token = '', body?: FormData | object) => app.request(path, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token,
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const form = (content = guide, revision = 0) => {
    const f = new FormData(); f.set('publication', JSON.stringify({ id, guide: content, revision, permission: true }));
    f.set('photo', new Blob([new Uint8Array(photo)]), 'file.jpg'); f.set('clip-one', new Blob([new Uint8Array(silentWav())]), 'voice.wav');
    return f;
  };
  return { db, call, alice, bob, form, advance: () => { time += SHARE_LIFETIME; } };
}

describe('Family Guides', () => {
  it('validates both authoring and publication, and makes an independent recipient projection', () => {
    const g = structuredClone(guide), snap = makeFamilySnapshot(g, true);
    g.steps[0].instruction = ''; g.steps[0].expected = ''; g.controls[0].box.x = 1; g.image = null;
    expect(familyIssues(g, false).map(i => i.code)).toEqual(expect.arrayContaining(['image','instruction','expected','control']));
    expect(snap.steps[0].instruction).toBe(guide.steps[0].instruction);
    expect(snap.steps[0].hotspot?.x).toBe(123 / 315);
    expect(JSON.stringify(snap)).not.toContain('draft-only');
    g.title = 'Wi-Fi password is example';
    expect(familyIssues(g, false, false).map(i => i.code)).toContain('secret');
    g.title = key();
    expect(familyIssues(g, false, false).map(i => i.code)).toContain('secret');
    g.nickname = 'name@example.invalid';
    expect(familyIssues(g, false, false).map(i => i.code)).toContain('contact');
    expect(() => makeFamilySnapshot(g, false)).toThrow();
  });

  it('validates image dimensions and bytes, removes metadata, and measures WAV duration from samples', () => {
    const comment = Buffer.from('a private camera comment');
    const segment = Buffer.concat([Buffer.from([255, 254, 0, comment.length + 2]), comment]);
    const withMetadata = Buffer.concat([photo.subarray(0, 2), segment, photo.subarray(2), comment]);
    const clean = privatePhoto(withMetadata, guide.image!);
    expect(clean?.includes(comment)).toBe(false);
    expect(privatePhoto(photo, { width: 300, height: 400 })).toBeUndefined();
    expect(privatePhoto(Buffer.from('not JPEG'), guide.image!)).toBeUndefined();
    expect(privateAudio(silentWav(15000))).toBe(true);
    expect(privateAudio(silentWav(15001))).toBe(false);
    expect(privateAudio(Buffer.from('invalid'))).toBe(false);
  });

  it('enforces creator ownership, immutable snapshots, rotation, revocation and private media reads', async () => {
    const { db, call, alice, bob, form } = setup();
    try {
      expect((await call('/owner/publish', '', form())).status).toBe(401);
      const res = await call('/owner/publish', alice, form());
      expect(res.status).toBe(201);
      const first = await res.json();
      expect(first.token).toMatch(/^[\w-]{43}$/);
      expect(db.prepare('SELECT token_hash FROM family_links').get()?.token_hash).toBe(digest(first.token));
      const view = await call('/view', first.token);
      expect(view.headers.get('cache-control')).toContain('no-store');
      const published = await view.text();
      for (const secret of ['creator-a', id, first.token, 'draft-only control', 'revision', 'controlId']) expect(published).not.toContain(secret);
      expect(JSON.parse(published).steps[0].hasAudio).toBe(true);
      expect((await call('/photo', first.token)).headers.get('content-type')).toBe('image/jpeg');
      expect((await call('/clip/one', first.token)).headers.get('content-type')).toBe('audio/wav');
      expect((await call('/owner/links', bob)).status).toBe(200);
      expect((await (await call('/owner/links', bob)).json()).links).toEqual([]);
      expect((await call('/owner/publish', bob, form(guide, 1))).status).toBe(404);
      expect((await call('/owner/revoke', bob, { id, revision: 1 })).status).toBe(404);
      expect((await call('/owner/revoke', first.token, { id, revision: 1 })).status).toBe(401);
      expect((await call('/owner/publish', alice, form(guide, 0))).status).toBe(409);
      const edited = { ...guide, title: 'New edition' };
      expect((await (await call('/view', first.token)).json()).title).toBe(guide.title);
      const next = await (await call('/owner/publish', alice, form(edited, 1))).json();
      expect(next.token).not.toBe(first.token);
      for (const path of ['/view','/photo','/clip/one']) expect((await call(path, first.token)).status).toBe(404);
      expect((await (await call('/view', next.token)).json()).title).toBe(edited.title);
      expect((await call('/owner/revoke', alice, { id, revision: next.revision })).status).toBe(200);
      for (const path of ['/view','/photo','/clip/one']) {
        const denied = await call(path, next.token);
        expect(denied.status).toBe(404); expect(await denied.json()).toEqual({ error: 'unavailable' });
      }
    } finally { db.close(); }
  });

  it('denies expired and unknown links on every endpoint, even without an owner listing', async () => {
    const { db, call, alice, form, advance } = setup();
    try {
      const { token } = await (await call('/owner/publish', alice, form())).json();
      advance();
      for (const invalid of [token, key(), 'invalid']) for (const path of ['/view','/photo','/clip/one']) {
        expect((await call(path, invalid)).status).toBe(404);
      }
    } finally { db.close(); }
  });

  it('retains the protected snapshot across database reopens and keeps token plaintext off disk', () => {
    const temp = resolve('tmp'); mkdirSync(temp, { recursive: true });
    const dir = mkdtempSync(join(temp, 'family-store-')), file = join(dir, 'test.sqlite');
    let db = new DatabaseSync(file);
    try {
      const saved = new FamilyStore(db).publish('owner', id, 0, makeFamilySnapshot(guide, true), photo, new Map([['one', silentWav()]]));
      db.close(); db = new DatabaseSync(file);
      const reopened = new FamilyStore(db);
      expect(reopened.list('owner')[0]).toMatchObject({ active: true, revision: 1 });
      expect(reopened.read(saved.token, 'photo')).toEqual(new Uint8Array(photo));
      expect(readFileSync(file).includes(saved.token)).toBe(false);
      reopened.revoke('owner', id, 1);
      expect(reopened.read(saved.token, 'clip', 'one')).toBeUndefined();
    } finally { db.close(); unlinkSync(file); rmdirSync(dir); }
  });

  it('refuses broken uploads and missing permission before issuing a link', async () => {
    const { db, call, alice, form } = setup();
    try {
      for (const change of [
        (f: FormData) => f.delete('photo'), (f: FormData) => f.delete('clip-one'),
        (f: FormData) => f.set('photo', new Blob(['fake']), 'a.jpg'),
        (f: FormData) => f.set('clip-one', new Blob([new Uint8Array(silentWav(20000))]), 'voice.wav'),
        (f: FormData) => f.set('publication', JSON.stringify({ id, guide, revision: 0, permission: false })),
      ]) { const f = form(); change(f); expect((await call('/owner/publish', alice, f)).status).toBe(422); }
      expect(db.prepare('SELECT count(*) AS n FROM family_links').get()?.n).toBe(0);
    } finally { db.close(); }
  });

  it('disables unconfigured sharing and mock speech, and invokes a configured speech adapter in the specified locale', async () => {
    const empty = await familyConfig({}, null);
    const disabled = familyRoutes(empty);
    expect(await (await disabled.request('/status')).json()).toEqual({ sharing: false, sarvam: false });
    const creator = key(), synthesize = vi.fn(async () => silentWav());
    const config = { ...empty, creators: new Map([[digest(creator), 'a']]), speech: { name: 'live' as const, synthesize, transcribe: vi.fn() } };
    expect(await (await familyRoutes({ ...config, speech: { ...config.speech, name: 'mock' } }).request('/status')).json()).toMatchObject({ sarvam: false });
    for (const locale of ['ml','en']) {
      const res = await familyRoutes(config).request('/owner/narrate', { method: 'POST', headers: { Authorization: 'Bearer ' + creator, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, text: 'HDMI 2' }) });
      expect(res.status).toBe(200); expect(synthesize).toHaveBeenLastCalledWith('HDMI 2', locale, expect.any(AbortSignal));
    }
  });
});
