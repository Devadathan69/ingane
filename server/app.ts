import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HDMI_COPY } from '../shared/hdmi-copy';
import { ClarificationAnswers, LOCALE, type GuideLocale } from '../shared/guide';
import type { ServerConfig } from './config';
import { buildGuide, VisionCache, verifyNarrationToken } from './guide';
import { checkAudio, checkImage, LIMITS } from './media';
import { isUiLocale } from '../shared/languages';
import { API_ERRORS } from './messages';
import { ProviderError } from './providers/types';
import { presetNarration } from './presets';

class ScreenFileError extends Error {
  constructor(readonly code: string) { super(code); }
}

type Window = { count: number; reset: number };

export class RateLimiter {
  private hits = new Map<string, Window>();
  constructor(private limit: number, private windowMs: number) {}
  take(key: string): boolean {
    const now = Date.now();
    const w = this.hits.get(key);
    if (!w || now > w.reset) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return true;
    }
    w.count += 1;
    return w.count <= this.limit;
  }
}

export interface AppOptions {
  config: ServerConfig;
  getIp?: (c: Context) => string;
  limits?: { guide: number; transcribe: number; speak: number; windowMs: number };
  /** Test hook: read the injected mock failure for this request. */
  setMockFailure?: (f: string | undefined) => void;
}

const localeOf = (v: unknown): GuideLocale => (LOCALE.safeParse(v).success ? (v as GuideLocale) : 'en');

export function createApp(opts: AppOptions) {
  const { config } = opts;
  const limits = opts.limits ?? { guide: 12, transcribe: 30, speak: 120, windowMs: 10 * 60_000 };
  const limiters = {
    guide: new RateLimiter(limits.guide, limits.windowMs),
    transcribe: new RateLimiter(limits.transcribe, limits.windowMs),
    speak: new RateLimiter(limits.speak, limits.windowMs),
  };
  const cache = new VisionCache();
  const ttsCache = new Map<string, Buffer>();
  const getIp = opts.getIp ?? ((c: Context) => (config.trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined) ?? 'local');

  const app = new Hono();
  const fail = (c: Context, status: number, code: string, locale: GuideLocale, media?: 'screen') => {
    const preferred = c.req.header('Accept-Language') ?? '';
    const ui = isUiLocale(preferred) ? preferred : isUiLocale(locale) ? locale : 'en';
    const message = media === 'screen' && code === 'image_dimensions' ? HDMI_COPY[ui].screenSize : API_ERRORS[code]?.[ui] ?? API_ERRORS.unavailable[ui];
    return c.json({ error: media ? 'screen_' + code : code, message }, status as 400);
  };

  const providerFail = (c: Context, err: unknown, locale: GuideLocale) => {
    const code = err instanceof ProviderError ? err.code : 'unavailable';
    // Validation details can include authored text or labels from a photo.
    console.warn(`[ingane] provider error: ${code}`);
    const status = code === 'timeout' ? 504 : code === 'refusal' || code === 'rejected' ? 422 : code === 'not_configured' ? 503 : 502;
    return fail(c, status, code, locale);
  };

  const withTimeout = () => AbortSignal.timeout(config.requestTimeoutMs);

  app.use('*', async (c, next) => {
    const t0 = Date.now();
    opts.setMockFailure?.(config.allowMockFailures ? c.req.header('x-ingane-mock-fail') : undefined);
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(self), microphone=(self)');
    if (c.req.path.startsWith('/api/')) {
      c.header('Cache-Control', 'no-store');
      console.log(`[ingane] ${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - t0}ms`);
    }
  });

  app.get('/api/health', (c) =>
    c.json({ ok: true, provider: config.guide?.name ?? 'none', guide: !!config.guide, speech: !!config.speech, demo: config.guide?.name === 'mock' }),
  );

  const tooLarge = (c: Context) => fail(c, 413, 'too_large', 'en');

  app.post('/api/guide', bodyLimit({ maxSize: 2 * LIMITS.imageBytes + 64 * 1024, onError: tooLarge }), async (c) => {
    let form: Record<string, string | File>;
    try {
      form = (await c.req.parseBody()) as Record<string, string | File>;
    } catch {
      return fail(c, 400, 'image_unreadable', 'en');
    }
    const locale = localeOf(form.locale);
    if (form.locale != null && !LOCALE.safeParse(form.locale).success) return fail(c, 400, 'bad_answers', locale);
    if (form.consent !== 'true') return fail(c, 400, 'consent_required', locale);
    if (!limiters.guide.take(getIp(c))) return fail(c, 429, 'rate_limited', locale);
    if (!config.guide) return fail(c, 503, 'not_configured', locale);

    const request = typeof form.request === 'string' ? form.request.trim() : '';
    if (!request) return fail(c, 400, 'request_missing', locale);
    if (request.length > LIMITS.requestChars) return fail(c, 400, 'request_long', locale);

    let answers: ClarificationAnswers = {};
    if (typeof form.answers === 'string' && form.answers) {
      try {
        const parsed = ClarificationAnswers.safeParse(JSON.parse(form.answers));
        if (!parsed.success) return fail(c, 400, 'bad_answers', locale);
        answers = parsed.data;
      } catch {
        return fail(c, 400, 'bad_answers', locale);
      }
    }

    if (!(form.image instanceof File)) return fail(c, 400, 'image_missing', locale);
    const img = checkImage(Buffer.from(await form.image.arrayBuffer()));
    if (!img.ok) return fail(c, 400, img.code, locale);
    const screenFile = form.screenImage;
    const screenImage = screenFile instanceof File ? async () => {
      const checked = checkImage(Buffer.from(await screenFile.arrayBuffer()));
      if (!checked.ok) throw new ScreenFileError(checked.code);
      return checked.image;
    } : undefined;

    try {
      const result = await buildGuide(
        { image: img.image, screenImage, request, locale, answers },
        { providers: config.guide, cache, secret: config.narrationSecret, signal: AbortSignal.any([withTimeout(), c.req.raw.signal]) },
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof ScreenFileError) return fail(c, 400, err.code, locale, 'screen');
      return providerFail(c, err instanceof Error && err.name === 'TimeoutError' ? new ProviderError('timeout', 'request timeout') : err, locale);
    }
  });

  app.post('/api/transcribe', bodyLimit({ maxSize: LIMITS.audioBytes + 16 * 1024, onError: tooLarge }), async (c) => {
    let form: Record<string, string | File>;
    try {
      form = (await c.req.parseBody()) as Record<string, string | File>;
    } catch {
      return fail(c, 400, 'audio_type', 'en');
    }
    const locale = localeOf(form.locale);
    if (form.locale != null && !LOCALE.safeParse(form.locale).success) return fail(c, 400, 'bad_answers', locale);
    if (form.consent !== 'true') return fail(c, 400, 'consent_required', locale);
    if (!limiters.transcribe.take(getIp(c))) return fail(c, 429, 'rate_limited', locale);
    if (!config.speech) return fail(c, 503, 'not_configured', locale);
    if (!(form.audio instanceof File)) return fail(c, 400, 'audio_type', locale);
    const bytes = Buffer.from(await form.audio.arrayBuffer());
    const chk = checkAudio(bytes);
    if (!chk.ok) return fail(c, 400, chk.code, locale);
    try {
      const transcript = (await config.speech.transcribe({ bytes, mime: chk.mime }, locale, withTimeout())).slice(0, LIMITS.requestChars);
      if (!transcript) return fail(c, 422, 'empty_transcript', locale);
      return c.json({ transcript, demo: config.speech.name === 'mock' });
    } catch (err) {
      return providerFail(c, err, locale);
    }
  });

  app.post('/api/speak', bodyLimit({ maxSize: 8 * 1024, onError: tooLarge }), async (c) => {
    let body: { locale?: unknown; text?: unknown; token?: unknown; preset?: unknown };
    try {
      body = await c.req.json();
      if (!body || typeof body !== 'object') return fail(c, 400, 'tts_forbidden', 'en');
    } catch {
      return fail(c, 400, 'tts_forbidden', 'en');
    }
    const locale = localeOf(body.locale);
    if (!LOCALE.safeParse(body.locale).success) return fail(c, 403, 'tts_forbidden', locale);
    let text: string | undefined;
    if ('preset' in body) {
      if ('text' in body || 'token' in body) return fail(c, 403, 'tts_forbidden', locale);
      text = presetNarration(body.preset, locale);
    } else if (typeof body.text === 'string' && body.text.length <= LIMITS.ttsChars && typeof body.token === 'string' &&
               verifyNarrationToken(config.narrationSecret, locale, body.text, body.token)) {
      text = body.text;
    }
    if (!text || text.length > LIMITS.ttsChars) return fail(c, 403, 'tts_forbidden', locale);
    if (!limiters.speak.take(getIp(c))) return fail(c, 429, 'rate_limited', locale);
    if (!config.speech) return fail(c, 503, 'not_configured', locale);
    const key = `${locale}\n${text}`;
    let wav = ttsCache.get(key);
    if (!wav) {
      try {
        wav = await config.speech.synthesize(text, locale, withTimeout());
      } catch (err) {
        return providerFail(c, err, locale);
      }
      if (ttsCache.size > 200) ttsCache.delete(ttsCache.keys().next().value as string);
      ttsCache.set(key, wav);
    }
    return c.body(new Uint8Array(wav), 200, { 'Content-Type': 'audio/wav' });
  });

  return app;
}
