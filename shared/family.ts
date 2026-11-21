import { z } from 'zod';
import { MEDIA_LIMITS } from './media';
import { BBox, bboxErrors, LOCALE } from './guide';

export const FAMILY_VERSION = 1;
export const FAMILY_LIMITS = { steps: 24, controls: 60, imageBytes: MEDIA_LIMITS.imageBytes,
  audioBytes: MEDIA_LIMITS.audioBytes, seconds: MEDIA_LIMITS.recordingSeconds } as const;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const side = z.int().min(MEDIA_LIMITS.imageMinSide).max(MEDIA_LIMITS.imageMaxSide);
const dimensions = z.strictObject({ width: side, height: side });
const action = z.strictObject({
  id, instruction: z.string().max(500), expected: z.string().max(400), recovery: z.string().max(500),
  screenLabel: z.string().max(100), audioLocale: LOCALE.nullable(),
});
const step = action.extend({ kind: z.enum(['button', 'checkpoint']), controlId: id.nullable() });
export const familyGuideSchema = z.strictObject({
  version: z.literal(FAMILY_VERSION), title: z.string().max(200), nickname: z.string().max(60),
  locale: LOCALE, before: z.string().max(500), demo: z.boolean(), image: dimensions.nullable(),
  controls: z.array(z.strictObject({ id, label: z.string().max(160), box: BBox })).max(FAMILY_LIMITS.controls),
  steps: z.array(step).max(FAMILY_LIMITS.steps),
});
export type FamilyGuide = z.infer<typeof familyGuideSchema>;
export type FamilyStep = FamilyGuide['steps'][number];
export const familySnapshotSchema = z.strictObject({
  version: z.literal(FAMILY_VERSION), title: z.string(), nickname: z.string(), locale: LOCALE,
  before: z.string(), demo: z.boolean(), image: dimensions,
  steps: z.array(action.omit({ audioLocale: true }).extend({
    button: z.string().trim().min(1).max(160).nullable(),
    hotspot: BBox.refine(b => bboxErrors(b, '').length === 0).nullable(), hasAudio: z.boolean(),
  }).refine(s => (s.button === null) === (s.hotspot === null))).min(1).max(FAMILY_LIMITS.steps),
});
export type FamilySnapshot = z.infer<typeof familySnapshotSchema>;
export type FamilyIssue = { code: 'format' | 'title' | 'image' | 'steps' | 'instruction' | 'expected' | 'recovery' | 'control' | 'secret' | 'contact'; step?: number };
export const containsCredential = (text: string) =>
  /(?:password|passphrase|api[ _-]?key|പാസ്.?വേഡ്)\s*(?:[:=]|\bis\b|ആണ്)\s*\S|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}|(?:^|[^\w-])[A-Za-z0-9_-]{43}(?![\w-])/i.test(text);
export const containsContact = (text: string) =>
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:^|[^\w])\+?(?:\d[\s().-]*){9,14}\d(?!\w)/i.test(text);

/** Incomplete work can be saved locally. Publishing and preview require every action and mark. */
export function familyIssues(g: FamilyGuide, hasPhoto: boolean, complete = true): FamilyIssue[] {
  if (!familyGuideSchema.safeParse(g).success) return [{ code: 'format' }];
  const issues: FamilyIssue[] = [];
  const copy = [g.title, g.nickname, g.before, ...g.controls.map(c => c.label),
    ...g.steps.flatMap(s => [s.instruction, s.expected, s.recovery, s.screenLabel])];
  if (copy.some(containsCredential)) issues.push({ code: 'secret' });
  if (copy.some(containsContact)) issues.push({ code: 'contact' });
  const controls = new Map(g.controls.map(c => [c.id, c]));
  if (controls.size !== g.controls.length || new Set(g.steps.map(s => s.id)).size !== g.steps.length) issues.push({ code: 'format' });
  if (!complete) return issues;
  if (!g.title.trim()) issues.push({ code: 'title' });
  if (!g.image || !hasPhoto) issues.push({ code: 'image' });
  if (!g.steps.length) issues.push({ code: 'steps' });
  for (const [index, s] of g.steps.entries()) {
    for (const field of ['instruction', 'expected', 'recovery'] as const) {
      if (!s[field].trim()) issues.push({ code: field, step: index + 1 });
    }
    const c = controls.get(s.controlId ?? '');
    if (s.kind === 'button' ? !c?.label.trim() || bboxErrors(c.box, '').length > 0 : s.controlId !== null) {
      issues.push({ code: 'control', step: index + 1 });
    }
  }
  if (g.controls.some(c => bboxErrors(c.box, '').length)) issues.push({ code: 'control' });
  return issues;
}

/** Project only recipient-visible fields. Never serialize the draft, its unused controls or its media URLs. */
export function makeFamilySnapshot(g: FamilyGuide, hasPhoto: boolean): FamilySnapshot {
  if (!g.image || familyIssues(g, hasPhoto).length) throw new Error('invalid_family_guide');
  return {
    version: FAMILY_VERSION, title: g.title, nickname: g.nickname, locale: g.locale, before: g.before, demo: g.demo,
    image: { ...g.image }, steps: g.steps.map(s => {
      const c = s.kind === 'button' ? g.controls.find(item => item.id === s.controlId) : undefined;
      return { id: s.id, instruction: s.instruction, expected: s.expected, recovery: s.recovery, screenLabel: s.screenLabel,
        button: c?.label ?? null, hotspot: c ? { ...c.box } : null, hasAudio: s.audioLocale === g.locale };
    }),
  };
}
