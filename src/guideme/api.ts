import type { ClarificationAnswers, GuideResult } from '../../shared/guide';
import { type UiLocale, type GuideLanguage as Locale } from '../../shared/languages';
import type { PresetNarration } from '../data/presets/types';

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const FALLBACK: Record<UiLocale, string> = {
  en: 'Could not reach the guide service. Check your connection and try again.',
  hi: 'गाइड सेवा से संपर्क नहीं हुआ। इंटरनेट कनेक्शन जाँचकर फिर कोशिश करें।',
  ta: 'வழிகாட்டி சேவையை அணுக முடியவில்லை. இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயலவும்.',
  kn: 'ಮಾರ್ಗದರ್ಶಿ ಸೇವೆಯನ್ನು ಸಂಪರ್ಕಿಸಲಾಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  te: 'గైడ్ సేవను చేరుకోలేకపోయాం. ఇంటర్నెట్ కనెక్షన్ చూసుకుని మళ్లీ ప్రయత్నించండి.',
  ml: 'ഗൈഡ് സേവനവുമായി ബന്ധപ്പെടാനായില്ല. കണക്ഷൻ നോക്കി വീണ്ടും ശ്രമിക്കുക.',
};

async function send(url: string, init: RequestInit, locale: Locale, appLocale?: UiLocale): Promise<Response> {
  const ui = appLocale ?? locale;
  const fallback = FALLBACK[ui];
  const headers = new Headers(init.headers);
  headers.set('Accept-Language', ui);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('network', fallback);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    const code = res.status === 504 ? 'timeout' : typeof body?.error === 'string' ? body.error : `http_${res.status}`;
    throw new ApiError(code, typeof body?.message === 'string' ? body.message : fallback);
  }
  return res;
}

export interface Health {
  ok: boolean;
  guide: boolean;
  speech: boolean;
  demo: boolean;
}

export async function getHealth(): Promise<Health | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch('api/health', { cache: 'no-store', signal: controller.signal });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestGuide(
  args: { image: Blob; screenImage?: Blob; request: string; locale: Locale; appLocale?: UiLocale; answers: ClarificationAnswers },
  signal?: AbortSignal,
): Promise<GuideResult> {
  const fd = new FormData();
  fd.set('consent', 'true');
  fd.set('locale', args.locale);
  fd.set('request', args.request);
  fd.set('answers', JSON.stringify(args.answers));
  fd.set('image', args.image, 'remote.jpg');
  if (args.screenImage) fd.set('screenImage', args.screenImage, 'screen.jpg');
  const res = await send('api/guide', { method: 'POST', body: fd, signal }, args.locale, args.appLocale);
  return (await res.json()) as GuideResult;
}

export async function transcribe(audio: Blob, locale: Locale, signal?: AbortSignal, appLocale?: UiLocale): Promise<string> {
  const fd = new FormData();
  fd.set('consent', 'true');
  fd.set('locale', locale);
  fd.set('audio', audio, 'request');
  const res = await send('api/transcribe', { method: 'POST', body: fd, signal }, locale, appLocale);
  return ((await res.json()) as { transcript: string }).transcript;
}

/** Session cache: each narration is synthesized at most once per page load. */
const speechCache = new Map<string, Promise<string>>();

function cachedSpeech(locale: Locale, key: string, body: object): Promise<string> {
  let p = speechCache.get(key);
  if (!p) {
    p = send('api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, locale)
      .then((r) => r.blob())
      .then((b) => URL.createObjectURL(b));
    p.catch(() => speechCache.delete(key));
    speechCache.set(key, p);
  }
  return p;
}

export function speakUrl(locale: Locale, text: string, token: string): Promise<string> {
  return cachedSpeech(locale, `v2\n${locale}\n${text}`, { locale, text, token });
}

export function speakPresetUrl(locale: Locale, preset: PresetNarration): Promise<string> {
  const body = { locale, preset };
  return cachedSpeech(locale, JSON.stringify(body), body);
}
