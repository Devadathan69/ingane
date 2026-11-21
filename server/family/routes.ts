import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { containsContact, containsCredential, FAMILY_LIMITS, familyGuideSchema, familyIssues, makeFamilySnapshot } from '../../shared/family';
import { LOCALE } from '../../shared/guide';
import { RateLimiter } from '../app';
import type { FamilyConfig } from './config';
import { privateAudio, privatePhoto } from './media';
import { digest, FamilyConflict, FamilyNotFound } from './store';

const identity = z.strictObject({ id: z.string().regex(/^[a-f0-9]{32}$/), revision: z.int().nonnegative() });
const publication = identity.extend({ guide: familyGuideSchema, permission: z.literal(true) });
const credential = (c: Context) => /^Bearer ([A-Za-z0-9_-]{43})$/.exec(c.req.header('Authorization') ?? '')?.[1] ?? '';
const small = bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'limit' }, 413) });
const gone = (c: Context) => c.json({ error: 'unavailable' }, 404);

export function familyRoutes(config: FamilyConfig) {
  const app = new Hono<{ Variables: { owner: string } }>();
  const tts = new RateLimiter(120, 600_000);
  const sharing = !!config.store && config.creators.size > 0;
  const sarvam = config.speech?.name === 'live' && config.creators.size > 0;
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store, max-age=0');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    await next();
  });
  // These routes deliberately bypass the V2 path logger. Tokens exist only in request headers.
  app.onError((err, c) => {
    if (err instanceof FamilyNotFound) return gone(c);
    if (err instanceof FamilyConflict) return c.json({ error: 'conflict' }, 409);
    return c.json({ error: 'unavailable' }, 503);
  });
  app.get('/status', c => c.json({ sharing, sarvam }));
  app.use('/owner/*', async (c, next) => {
    const owner = config.creators.get(digest(credential(c)));
    if (!owner) return c.json({ error: 'sign_in' }, 401);
    c.set('owner', owner); await next();
  });
  app.get('/owner/links', c => c.json({ links: config.store?.list(c.get('owner')) ?? [] }));
  app.post('/owner/publish', bodyLimit({
    maxSize: FAMILY_LIMITS.imageBytes + FAMILY_LIMITS.steps * FAMILY_LIMITS.audioBytes + 256 * 1024,
    onError: c => c.json({ error: 'limit' }, 413),
  }), async c => {
    if (!sharing || !config.store) return gone(c);
    const form = await c.req.formData().catch(() => null);
    const invalid = () => c.json({ error: 'invalid_guide' }, 422);
    if (!form) return invalid();
    const raw = form.get('publication');
    if (typeof raw !== 'string' || raw.length > 150_000) return invalid();
    let parsed;
    try { parsed = publication.safeParse(JSON.parse(raw)); } catch { return invalid(); }
    if (!parsed.success) return invalid();
    const { guide, id, revision } = parsed.data;
    const image = form.get('photo');
    if (!(image instanceof File) || image.size > FAMILY_LIMITS.imageBytes || !guide.image || familyIssues(guide, true).length) return invalid();
    const photo = privatePhoto(Buffer.from(await image.arrayBuffer()), guide.image);
    if (!photo) return invalid();
    const snapshot = makeFamilySnapshot(guide, true);
    const clips = new Map<string, Buffer>();
    for (const step of snapshot.steps.filter(s => s.hasAudio)) {
      const file = form.get('clip-' + step.id);
      if (!(file instanceof File) || file.size > FAMILY_LIMITS.audioBytes) return invalid();
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!privateAudio(bytes)) return invalid();
      clips.set(step.id, bytes);
    }
    if ([...form.keys()].length !== 2 + clips.size) return invalid();
    return c.json(config.store.publish(c.get('owner'), id, revision, snapshot, photo, clips), 201);
  });
  app.post('/owner/revoke', small, async c => {
    const data = identity.safeParse(await c.req.json().catch(() => null));
    if (!config.store || !data.success) return gone(c);
    config.store.revoke(c.get('owner'), data.data.id, data.data.revision);
    return c.json({ ok: true });
  });
  app.post('/owner/narrate', small, async c => {
    if (!sarvam || !config.speech) return c.json({ error: 'unavailable' }, 503);
    const data = z.strictObject({ locale: LOCALE, text: z.string().trim().min(1).max(600) }).safeParse(await c.req.json().catch(() => null));
    if (!data.success || containsCredential(data.data.text) || containsContact(data.data.text)) return c.json({ error: 'invalid' }, 422);
    if (!tts.take(c.get('owner'))) return c.json({ error: 'limit' }, 429);
    const wav = await config.speech.synthesize(data.data.text, data.data.locale, AbortSignal.timeout(20_000));
    return c.body(new Uint8Array(wav), 200, { 'Content-Type': 'audio/wav' });
  });
  app.get('/view', c => {
    const data = config.store?.read(credential(c), 'snapshot');
    return typeof data === 'string' ? c.body(data, 200, { 'Content-Type': 'application/json' }) : gone(c);
  });
  app.get('/photo', c => {
    const b = config.store?.read(credential(c), 'photo');
    return b instanceof Uint8Array ? c.body(new Uint8Array(b), 200, { 'Content-Type': 'image/jpeg' }) : gone(c);
  });
  app.get('/clip/:step', c => {
    const b = config.store?.read(credential(c), 'clip', c.req.param('step'));
    return b instanceof Uint8Array ? c.body(new Uint8Array(b), 200, { 'Content-Type': 'audio/wav' }) : gone(c);
  });
  app.all('*', gone);
  return app;
}
