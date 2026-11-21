import { bboxErrors, GuideResult, MALAYALAM_SCRIPT, type GuideResult as Result } from '../shared/guide';
import { languages, type GuideLanguage } from '../shared/languages';
import { findReference } from './references';

/**
 * Final gate before anything reaches the client. Returns human-readable errors; empty means valid.
 * screenLabels: exact labels read from the user's TV-screen photo in this request (if any).
 */
const nativeScript: Partial<Record<GuideLanguage, RegExp>> = { ml: MALAYALAM_SCRIPT, hi: /\p{Script=Devanagari}/u, ta: /\p{Script=Tamil}/u, kn: /\p{Script=Kannada}/u, te: /\p{Script=Telugu}/u };

export function validateGuideResult(result: unknown, ctx: { screenLabels: string[] }): string[] {
  const parsed = GuideResult.safeParse(result);
  if (!parsed.success) return parsed.error.issues.map((i) => `schema: ${i.path.join('.')}: ${i.message}`);
  const r: Result = parsed.data;
  const errors: string[] = [];
  const script = nativeScript[r.locale];
  const reply = r.clarification?.question ?? r.unsupportedReason;
  if (script && reply && !script.test(reply)) errors.push(`reply must be in ${languages[r.locale].name} script`);

  const ids = new Set<string>();
  for (const c of r.observedControls) {
    if (ids.has(c.id)) errors.push(`control ${c.id}: duplicate id`);
    ids.add(c.id);
    errors.push(...bboxErrors(c.bbox, `control ${c.id}`));
  }

  for (const ref of r.evidenceRefs) {
    if (ref.kind === 'screen') {
      if (!ctx.screenLabels.length) errors.push(`ref ${ref.id}: screen evidence without a screen photo`);
      continue;
    }
    const known = findReference(ref.id);
    if (!known) errors.push(`ref ${ref.id}: unknown reference`);
    else if (known.status !== 'approved') errors.push(`ref ${ref.id}: reference is not approved`);
  }

  if (r.status === 'ready') {
    if (!r.steps.length) errors.push('ready guide has no steps');
    if (r.clarification) errors.push('ready guide must not carry a clarification');
    if (r.unsupportedReason) errors.push('ready guide must not carry an unsupported reason');
    if (!r.evidenceRefs.length) errors.push('ready guide must cite evidence');
    const stepIds = new Set<string>();
    for (const s of r.steps) {
      const at = `step ${s.id}`;
      if (stepIds.has(s.id)) errors.push(`${at}: duplicate id`);
      stepIds.add(s.id);
      if (!s.controlId && !s.screenLabel) errors.push(`${at}: needs a controlId or screenLabel`);
      if (s.controlId && !ids.has(s.controlId)) errors.push(`${at}: controlId "${s.controlId}" is not an observed control`);
      if (s.screenLabel) {
        if (!ctx.screenLabels.includes(s.screenLabel)) errors.push(`${at}: screenLabel "${s.screenLabel}" was not seen on the TV screen`);
        if (!s.narration.includes(s.screenLabel)) errors.push(`${at}: narration must contain the exact label`);
        if (!s.instruction.includes(s.screenLabel)) errors.push(`${at}: instruction must contain the exact label "${s.screenLabel}"`);
      }
      if (script) {
        for (const k of ['instruction', 'narration', 'expectedState', 'mismatchRecovery'] as const) {
          if (!script.test(s[k])) errors.push(`${at}: ${k} must be in ${languages[r.locale].name} script`);
        }
      }
    }
    if (Object.keys(r.narrationTokens).sort().join() !== [...stepIds].sort().join()) errors.push('narration tokens do not match steps');
  } else {
    if (r.steps.length) errors.push(`${r.status} result must not contain runnable steps`);
    if (Object.keys(r.narrationTokens).length) errors.push(`${r.status} result must not carry narration tokens`);
    if (r.status === 'needs_clarification') {
      if (!r.clarification) errors.push('needs_clarification requires a clarification');
      else if (r.clarification.controlId && !ids.has(r.clarification.controlId)) errors.push('clarification references an unknown control');
      if (r.clarification?.kind === 'confirm_button' && !r.clarification.controlId) errors.push('confirm_button needs a controlId');
    }
    if (r.status === 'unsupported' && !r.unsupportedReason) errors.push('unsupported requires a reason');
  }
  return errors;
}
