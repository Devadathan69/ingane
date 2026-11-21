import { FAMILY_LIMITS, FAMILY_VERSION, type FamilyGuide, type FamilyStep } from '../../shared/family';
import type { GuideLanguage } from '../../shared/languages';
import type { GuideResult } from '../../shared/guide';
import { presetText, stepsFor } from '../data/presets/catalog';
import type { CatalogEntry, TaskGuide } from '../data/presets/types';
import type { Locale } from '../data/types';
import type { NormalizedPhoto } from '../guideme/photo';

export interface FamilyDraft {
  id: string; revision: number; updatedAt: number;
  guide: FamilyGuide; photo: Blob | null; clips: Record<string, Blob>;
}
export type DraftChange = FamilyDraft | ((current: FamilyDraft) => FamilyDraft);
export type FamilySeed =
  | { source: 'preset'; entry: CatalogEntry; guide: TaskGuide; port: string | null; locale: Locale }
  | { source: 'session'; result: GuideResult; photo: NormalizedPhoto };

export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
export const newStep = (): FamilyStep => ({
  id: newId(), kind: 'button', controlId: null, instruction: '', expected: '', recovery: '', screenLabel: '', audioLocale: null,
});
export function blankDraft(locale: GuideLanguage): FamilyDraft {
  return { id: newId(), revision: 0, updatedAt: 0, photo: null, clips: {},
    guide: { version: FAMILY_VERSION, locale, title: '', nickname: '', before: '', demo: false, image: null, controls: [], steps: [newStep()] } };
}

export async function draftFromSeed(seed: FamilySeed): Promise<FamilyDraft> {
  if (seed.source === 'session') {
    const { result, photo } = seed;
    if (result.status !== 'ready') throw new Error('not_ready');
    const draft = blankDraft(result.locale);
    const controls = result.observedControls.filter(c => c.display === 'box').map(c =>
      ({ sourceId: c.id, id: newId(), label: c.label, box: { ...c.bbox } }));
    draft.photo = photo.blob;
    Object.assign(draft.guide, { title: result.task.summary, demo: result.demo,
      image: { width: photo.width, height: photo.height }, controls: controls.map(({ id, label, box }) => ({ id, label, box })),
    });
    draft.guide.steps = result.steps.map(s => {
      const control = controls.find(c => c.sourceId === s.controlId);
      return { ...newStep(), kind: control ? 'button' : 'checkpoint', controlId: control?.id ?? null,
        instruction: s.instruction, expected: s.expectedState, recovery: s.mismatchRecovery, screenLabel: s.screenLabel ?? '' };
    });
    return draft;
  }
  const { entry, guide, port, locale } = seed;
  const route = stepsFor(guide, port);
  if (!route?.length) throw new Error('invalid_route');
  const draft = blankDraft(locale);
  const { asset, controls } = entry.remote;
  Object.assign(draft.guide, {
    title: guide.title[locale], before: presetText(guide.startingState, locale, port), demo: guide.status === 'demo',
    image: { width: asset.width, height: asset.height },
    controls: Object.entries(controls).map(([id, c]) => ({ id, label: c.label[locale], box: { ...c.hotspot } })),
  });
  draft.guide.steps = route.map(s => {
    const instruction = presetText(s.instruction, locale, port);
    const expected = presetText(s.expected, locale, port);
    return { ...newStep(), controlId: s.controlId, instruction, expected, recovery: presetText(s.recovery, locale, port),
      screenLabel: (expected + ' ' + instruction).match(/\bHDMI\s+\d+\b/i)?.[0] ?? '' };
  });
  try {
    const res = await fetch(asset.src);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type === 'image/jpeg' && blob.size > 0 && blob.size <= FAMILY_LIMITS.imageBytes) draft.photo = blob;
    }
  } catch { /* The editor keeps the copied text and reports the missing photo. */ }
  return draft;
}
