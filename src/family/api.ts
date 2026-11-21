import { familySnapshotSchema } from '../../shared/family';
import type { Locale } from '../data/types';
import type { FamilyDraft } from './draft';

export interface ShareState { id: string; revision: number; active: boolean; expires: number; title: string }
export interface Capabilities { sharing: boolean; sarvam: boolean }
const base = 'api/family/';
async function request(path: string, key: string, init: RequestInit = {}) {
  if (key && window.isSecureContext === false) throw new Error('secure_origin_required');
  const headers = new Headers(init.headers);
  if (key) headers.set('Authorization', 'Bearer ' + key);
  const res = await fetch(base + path, { ...init, headers, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('family_' + res.status);
  return res;
}
export async function capabilities(): Promise<Capabilities> {
  if (window.isSecureContext === false) return { sharing: false, sarvam: false };
  try {
    const data = await (await request('status', '')).json();
    return { sharing: data.sharing === true, sarvam: data.sarvam === true };
  } catch { return { sharing: false, sarvam: false }; }
}
const postJson = (body: object): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const ownerLinks = async (key: string): Promise<ShareState[]> => (await (await request('owner/links', key)).json()).links;
export async function publish(draft: FamilyDraft, revision: number, permission: boolean, key: string): Promise<{ token: string; revision: number; expires: number }> {
  const form = new FormData();
  form.set('publication', JSON.stringify({ guide: draft.guide, id: draft.id, revision, permission }));
  if (draft.photo) form.set('photo', draft.photo, 'remote.jpg');
  for (const step of draft.guide.steps) {
    if (step.audioLocale === draft.guide.locale && draft.clips[step.id]) form.set('clip-' + step.id, draft.clips[step.id], 'step.wav');
  }
  return (await request('owner/publish', key, { method: 'POST', body: form })).json();
}
export const stopSharing = (state: ShareState, key: string) => request('owner/revoke', key, postJson({ id: state.id, revision: state.revision }));
export const sarvamClip = async (key: string, locale: Locale, text: string) => (await request('owner/narrate', key, postJson({ locale, text }))).blob();
export const viewerSnapshot = async (token: string, signal: AbortSignal) => familySnapshotSchema.parse(await (await request('view', token, { signal })).json());
export const viewerMedia = async (token: string, step?: string, signal?: AbortSignal) =>
  (await request(step ? 'clip/' + encodeURIComponent(step) : 'photo', token, { signal })).blob();
