import { audioReady, familySnapshotSchema } from '../../shared/family';
import type { GuideLanguage } from '../../shared/languages';
import type { FamilyDraft } from './draft';

export interface ShareState { id: string; revision: number; active: boolean; expires: number; title: string }
export interface Capabilities { sharing: boolean; sarvam: boolean; passkeys?: boolean; signedIn?: boolean }
// A marker for a secure, HttpOnly session cookie. The browser never receives the creator credential in JS.
export const PASSKEY_SESSION = 'passkey-session';
const base = 'api/family/';
async function request(path: string, key: string, init: RequestInit = {}) {
  if (key && window.isSecureContext === false) throw new Error('secure_origin_required');
  const headers = new Headers(init.headers);
  const session = key === PASSKEY_SESSION;
  if (key && !session) headers.set('Authorization', 'Bearer ' + key);
  const res = await fetch(base + path, { ...init, headers, cache: 'no-store', credentials: session ? 'same-origin' : 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('family_' + res.status);
  return res;
}
export async function capabilities(): Promise<Capabilities> {
  if (window.isSecureContext === false) return { sharing: false, sarvam: false };
  try {
    const data = await (await request('status', PASSKEY_SESSION)).json();
    return { sharing: data.sharing === true, sarvam: data.sarvam === true, passkeys: data.passkeys === true, signedIn: data.signedIn === true };
  } catch { return { sharing: false, sarvam: false }; }
}
const postJson = (body: object): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export async function passkeySignIn(kind: 'register' | 'login') {
  const { startRegistration, startAuthentication } = await import('@simplewebauthn/browser');
  const optionsJSON = await (await request('auth/options/' + kind, PASSKEY_SESSION, { method: 'POST' })).json();
  const response = kind === 'register' ? await startRegistration({ optionsJSON }) : await startAuthentication({ optionsJSON });
  await request('auth/finish/' + kind, PASSKEY_SESSION, postJson(response));
}
export const passkeySignOut = () => request('auth/logout', PASSKEY_SESSION, { method: 'POST' });
export const ownerLinks = async (key: string): Promise<ShareState[]> => (await (await request('owner/links', key)).json()).links;
export async function publish(draft: FamilyDraft, revision: number, permission: boolean, key: string): Promise<{ token: string; revision: number; expires: number }> {
  const publication = { guide: draft.guide, id: draft.id, revision, permission };
  if (key === PASSKEY_SESSION) {
    if (!draft.photo) throw new Error('missing_photo');
    const { batch } = await (await request('owner/upload/begin', key, postJson(publication))).json();
    const headers = { 'X-Family-Upload': batch };
    const upload = (part: string, body: Blob, type: string) => request('owner/upload/media', key, { method: 'PUT', body,
      headers: { ...headers, 'X-Family-Part': part, 'Content-Type': type } });
    try {
      await upload('photo', draft.photo, 'image/jpeg');
      for (const step of draft.guide.steps) {
        if (audioReady(step,draft.guide.locale)) {
          if (!draft.clips[step.id]) throw new Error('missing_clip');
          await upload('clip-' + step.id, draft.clips[step.id], 'audio/wav');
        }
      }
      return await (await request('owner/upload/finish', key, { method: 'POST', headers })).json();
    } catch (err) {
      await request('owner/upload/pending', key, { method: 'DELETE', headers }).catch(() => {});
      throw err;
    }
  }
  const form = new FormData();
  form.set('publication', JSON.stringify(publication));
  if (draft.photo) form.set('photo', draft.photo, 'remote.jpg');
  for (const step of draft.guide.steps) {
    if (audioReady(step, draft.guide.locale) && draft.clips[step.id]) form.set('clip-' + step.id, draft.clips[step.id], 'step.wav');
  }
  return (await request('owner/publish', key, { method: 'POST', body: form })).json();
}
export const stopSharing = (state: ShareState, key: string) => request('owner/revoke', key, postJson({ id: state.id, revision: state.revision }));
export const sarvamClip = async (key: string, locale: GuideLanguage, text: string, signal?: AbortSignal) => (await request('owner/narrate', key, { ...postJson({ locale, text }), signal })).blob();
export const viewerSnapshot = async (token: string, signal: AbortSignal) => familySnapshotSchema.parse(await (await request('view', token, { signal })).json());
export const viewerMedia = async (token: string, step?: string, signal?: AbortSignal) =>
  (await request(step ? 'clip/' + encodeURIComponent(step) : 'photo', token, { signal })).blob();
