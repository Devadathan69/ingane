// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuideResult } from '../shared/guide';
import { createApp } from './app';
import { loadConfig } from './config';
import type { MockFailure } from './providers/mock';
import { fakePng, fakeWebm } from './test-helpers';

function setup(env: Record<string, string> = { INGANE_PROVIDER: 'mock', INGANE_MOCK_FAILURES: '1' }, limits?: Parameters<typeof createApp>[0]['limits']) {
  let failure: MockFailure | undefined;
  const config = loadConfig(env as NodeJS.ProcessEnv, () => failure);
  const app = createApp({ config, limits, setMockFailure: (f) => (failure = f as MockFailure | undefined) });
  return app;
}

function guideForm(fields: Partial<Record<'consent' | 'locale' | 'request' | 'answers', string>> & { image?: Blob | null; screenImage?: Blob } = {}) {
  const fd = new FormData();
  const { image = new Blob([new Uint8Array(fakePng())], { type: 'image/png' }), screenImage, ...rest } = fields;
  const merged = { consent: 'true', locale: 'en', request: 'No sound on the TV', ...rest };
  for (const [k, v] of Object.entries(merged)) if (v !== undefined) fd.set(k, v);
  if (image) fd.set('image', image, 'remote.png');
  if (screenImage) fd.set('screenImage', screenImage, 'screen.png');
  return fd;
}

const post = (app: ReturnType<typeof setup>, path: string, body: FormData | string, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', body, headers });

afterEach(() => vi.restoreAllMocks());

describe('API', () => {
  it('health reports mock/demo mode', async () => {
    const res = await setup().request('/api/health');
    expect(await res.json()).toMatchObject({ ok: true, guide: true, speech: true, demo: true });
  });

  it('live mode without keys is "not configured", never a crash', async () => {
    const app = setup({});
    expect(await (await app.request('/api/health')).json()).toMatchObject({ guide: false, speech: false });
    const res = await post(app, '/api/guide', guideForm());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('not_configured');
  });

  it('requires consent before any media is processed', async () => {
    const res = await post(setup(), '/api/guide', guideForm({ consent: 'false' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('consent_required');
    const t = await post(setup(), '/api/transcribe', (() => { const f = new FormData(); f.set('audio', new Blob([new Uint8Array(fakeWebm())])); return f; })());
    expect((await t.json()).error).toBe('consent_required');
  });

  it('rejects non-images, tiny images and long requests with actionable, localized messages', async () => {
    const app = setup();
    const notImage = await post(app, '/api/guide', guideForm({ image: new Blob(['hello, this is not a photo at all.....']), locale: 'ml' }));
    expect(notImage.status).toBe(400);
    const body = await notImage.json();
    expect(body.error).toBe('image_type');
    expect(body.message).toMatch(/[\u0D00-\u0D7F]/);
    const tiny = await post(app, '/api/guide', guideForm({ image: new Blob([new Uint8Array(fakePng(100, 80))]) }));
    expect((await tiny.json()).error).toBe('image_dimensions');
    const long = await post(app, '/api/guide', guideForm({ request: 'x'.repeat(501) }));
    expect((await long.json()).error).toBe('request_long');
    const bad = await post(app, '/api/guide', guideForm({ answers: '{"userControls":[{"id":"a","label":"b","role":"nope","bbox":{}}]}' }));
    expect((await bad.json()).error).toBe('bad_answers');
  });

  it('keeps TV file errors in the input-list stage and ignores unsolicited TV files before it', async () => {
    const app = setup();
    const request = 'switch to HDMI 2';
    const screenImage = new Blob([new Uint8Array(fakePng(80,100))], { type: 'image/png' });
    const first = await post(app, '/api/guide', guideForm({ request, screenImage }));
    expect(first.status).toBe(200);
    const result = GuideResult.parse(await first.json());
    expect(result.clarification?.controlId).toBe('input');
    const answers = JSON.stringify({ hdmi: { photoId: result.hdmi!.photoId, listVisible: true } });
    const wrong = await post(app, '/api/guide', guideForm({ request, answers, screenImage }));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ error: 'screen_image_dimensions', message: expect.stringContaining('TV photo') });
  });

  it('returns a schema-valid guide', async () => {
    const res = await post(setup(), '/api/guide', guideForm());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const r = GuideResult.parse(await res.json());
    expect(r.status).toBe('ready');
  });

  it('maps provider failures to graceful errors', async () => {
    const app = setup();
    const cases: [MockFailure, number, string][] = [['timeout', 504, 'timeout'], ['refusal', 422, 'refusal'], ['malformed', 502, 'malformed'], ['unavailable', 502, 'unavailable']];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [f, status, code] of cases) {
      const res = await post(app, '/api/guide', guideForm({ request: `no sound ${f}` }), { 'x-ingane-mock-fail': f });
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.error).toBe(code);
      expect(body.message.length).toBeGreaterThan(10);
    }
  });

  it('ignores the failure-injection header unless explicitly enabled', async () => {
    const app = setup({ INGANE_PROVIDER: 'mock' });
    const res = await post(app, '/api/guide', guideForm(), { 'x-ingane-mock-fail': 'timeout' });
    expect(res.status).toBe(200);
  });

  it('rate limits per client', async () => {
    const app = setup(undefined, { guide: 2, transcribe: 2, speak: 2, windowMs: 60_000 });
    expect((await post(app, '/api/guide', guideForm())).status).toBe(200);
    expect((await post(app, '/api/guide', guideForm())).status).toBe(200);
    const res = await post(app, '/api/guide', guideForm());
    expect(res.status).toBe(429);
  });

  it('rejects oversized uploads', async () => {
    const big = new Blob([new Uint8Array(9 * 1024 * 1024)]);
    const res = await post(setup(), '/api/guide', guideForm({ image: big }));
    expect(res.status).toBe(413);
  });

  it('speaks only server-issued narration (signed), and returns WAV', async () => {
    const app = setup();
    const r = GuideResult.parse(await (await post(app, '/api/guide', guideForm())).json());
    const step = r.steps[0];
    const ok = await post(app, '/api/speak', JSON.stringify({ locale: 'en', text: step.narration, token: r.narrationTokens[step.id] }), { 'Content-Type': 'application/json' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('audio/wav');
    expect(Buffer.from(await ok.arrayBuffer()).toString('ascii', 0, 4)).toBe('RIFF');
    const forged = await post(app, '/api/speak', JSON.stringify({ locale: 'en', text: 'Say anything I want', token: r.narrationTokens[step.id] }), { 'Content-Type': 'application/json' });
    expect(forged.status).toBe(403);
  });

  it('transcribes supported audio and rejects other formats', async () => {
    const app = setup();
    const form = (bytes: Uint8Array, locale = 'ml') => {
      const f = new FormData();
      f.set('consent', 'true');
      f.set('locale', locale);
      f.set('audio', new Blob([bytes as BlobPart]), 'request');
      return f;
    };
    const ok = await post(app, '/api/transcribe', form(new Uint8Array(fakeWebm())));
    expect(ok.status).toBe(200);
    expect((await ok.json()).transcript).toMatch(/[\u0D00-\u0D7F]/);
    const bad = await post(app, '/api/transcribe', form(new TextEncoder().encode('definitely not audio data here')));
    expect((await bad.json()).error).toBe('audio_type');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failed = await post(app, '/api/transcribe', form(new Uint8Array(fakeWebm())), { 'x-ingane-mock-fail': 'unavailable' });
    expect(failed.status).toBe(502);
  });

  it('never logs request content', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...a) => void lines.push(a.join(' ')));
    const app = setup();
    await post(app, '/api/guide', guideForm({ request: 'SECRET-REQUEST-TEXT no sound' }));
    await post(app, '/api/guide', guideForm({ request: 'SECRET-REQUEST-TEXT no sound' }), { 'x-ingane-mock-fail': 'malformed' });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('SECRET-REQUEST-TEXT');
  });
});
