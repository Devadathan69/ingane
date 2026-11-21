import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { FAMILY_LIMITS, familyIssues, makeFamilySnapshot } from '../../shared/family';
import { privateAudio, privatePhoto } from './media';
import { publication } from './publication';
import type { PgFamilyStore } from './postgres';

export function uploadRoutes(store: PgFamilyStore) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.post('/begin', bodyLimit({ maxSize: 180_000, onError: c => c.json({error:'limit'},413) }), async c => {
    const parsed = publication.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || familyIssues(parsed.data.guide,true).length) return c.json({error:'invalid_guide'},422);
    const {guide,id,revision} = parsed.data;
    return c.json({ batch: await store.begin(c.get('owner'), id, revision, makeFamilySnapshot(guide,true)) }, 201);
  });
  app.put('/media', bodyLimit({ maxSize: FAMILY_LIMITS.imageBytes, onError: c => c.json({error:'limit'},413) }), async c => {
    const batch = c.req.header('X-Family-Upload') ?? '', part = c.req.header('X-Family-Part') ?? '';
    const snapshot = await store.pending(c.get('owner'),batch);
    const input = Buffer.from(await c.req.arrayBuffer());
    let clean;
    if (part === 'photo' && c.req.header('Content-Type') === 'image/jpeg') clean = privatePhoto(input,snapshot.image);
    else if (c.req.header('Content-Type') === 'audio/wav' && input.length <= FAMILY_LIMITS.audioBytes &&
      snapshot.steps.some(s => s.hasAudio && part === 'clip-' + s.id) && privateAudio(input)) clean = input;
    if (!clean) return c.json({error:'invalid_media'},422);
    await store.write(c.get('owner'), batch, part, clean);
    return c.body(null, 204);
  });
  app.post('/finish', async c => c.json(await store.finish(c.get('owner'), c.req.header('X-Family-Upload') ?? ''), 201));
  app.delete('/pending', async c => {
    await store.discard(c.get('owner'), c.req.header('X-Family-Upload') ?? '');
    return c.body(null, 204);
  });
  return app;
}
