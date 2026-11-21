import { overlapRatio, bboxErrors, GuideResult, MALAYALAM_SCRIPT, type GuideResult as Result } from '../shared/guide';
import { languages, type GuideLanguage } from '../shared/languages';
import { HDMI_COPY, hdmiText } from '../shared/hdmi-copy';
import { hasSourceLabel, isMenuOpener, selectKey } from './hdmi';
import { findReference } from './references';

/**
 * Final gate before anything reaches the client. Returns human-readable errors; empty means valid.
 * screenLabels: exact labels read from the user's TV-screen photo in this request (if any).
 */
const nativeScript: Partial<Record<GuideLanguage, RegExp>> = { ml: MALAYALAM_SCRIPT, hi: /\p{Script=Devanagari}/u, ta: /\p{Script=Tamil}/u, kn: /\p{Script=Kannada}/u, te: /\p{Script=Telugu}/u };

export interface ValidationContext {
  screenLabels: string[];
  hdmiPhotoId?: string;
  confirmed?: string[];
  listVisible?: boolean;
  selectedLabel?: string | null;
  inputEvidence?: 'typed-inputs' | 'screen-photo';
}

export function validateGuideResult(result: unknown, ctx: ValidationContext): string[] {
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

  const isHdmi = r.task.type === 'switch_hdmi';
  const checkpoint = r.status === 'hdmi_checkpoint';
  if (r.hdmi && (!isHdmi || r.hdmi.photoId !== ctx.hdmiPhotoId)) errors.push('HDMI continuation belongs to a different photo or task');
  if (isHdmi && r.status !== 'unsupported' && !r.hdmi) errors.push('HDMI requires a bound continuation');
  if (r.hdmi && (r.hdmi.labels.length !== ctx.screenLabels.length || r.hdmi.labels.some(l => !ctx.screenLabels.includes(l))))
    errors.push('continuation must contain only supplied input labels');
  if (checkpoint) {
    const s = r.steps[0];
    const sources = r.observedControls.filter(isMenuOpener);
    const c = sources.find(x => x.id === s?.controlId);
    const confirmed = c && ctx.confirmed?.includes(c.id);
    const t = HDMI_COPY[r.locale];
    if (!isHdmi || r.hdmi?.stage !== 'await_input_list' || ctx.listVisible || r.steps.length !== 1 || r.evidenceRefs.length ||
        !c || c.confidence !== 'high' || (!confirmed && (c.source === 'user' || !hasSourceLabel(c) || sources.length !== 1 ||
          r.observedControls.some(o => o.id !== c.id && overlapRatio(c.bbox, o.bbox) > 0))) ||
        s.screenLabel !== null || s.id !== 'open-input-list' || s.instruction !== hdmiText(t.press, c.label) || s.expectedState !== t.listExpected ||
        s.narration !== s.instruction + ' ' + t.listExpected || s.mismatchRecovery !== t.checkSource)
      errors.push('checkpoint requires exactly one grounded input-menu opener');
  }
  if (isHdmi && r.status === 'ready') {
    const target = r.steps[0]?.screenLabel;
    const t = HDMI_COPY[r.locale];
    if (!ctx.listVisible || r.hdmi?.stage !== 'select_input' || !ctx.inputEvidence || !target ||
        r.evidenceRefs.length !== 1 || r.evidenceRefs[0].kind !== 'screen' || r.evidenceRefs[0].id !== ctx.inputEvidence ||
        r.steps.some(s => s.screenLabel !== target))
      errors.push('HDMI selection requires an acknowledged list and its exact target');
    if (target) {
      const alreadyFocused = ctx.inputEvidence === 'screen-photo' && ctx.selectedLabel === target;
      const final = r.steps.at(-1)!;
      const ok = final.controlId ? selectKey(r.observedControls) : undefined;
      const instruction = hdmiText(ok ? t.selectKey : t.select, target, ok?.label);
      if (r.steps.length !== (alreadyFocused ? 1 : 2) || final.id !== 'select-input' || final.controlId !== (ok?.id ?? null) ||
          final.instruction !== instruction || final.narration !== instruction || final.expectedState !== t.picture)
        errors.push('HDMI must end with an evidenced selection and picture confirmation');
      if (!alreadyFocused) {
        const first = r.steps[0];
        if (first.id !== 'highlight-input' || first.controlId !== null || first.instruction !== hdmiText(t.highlight, target) ||
            first.narration !== first.instruction || first.expectedState !== hdmiText(t.highlighted, target))
          errors.push('HDMI needs confirmed focus before selecting the target');
      }
    }
  }
  if (isHdmi && r.status === 'needs_clarification') {
    const kind = r.clarification?.kind;
    const allowed = ctx.listVisible ? ['input_list', 'choose_input'] : ['confirm_button', 'mark_source', 'clearer_photo'];
    if (!kind || !allowed.includes(kind) || r.hdmi?.stage !== (ctx.listVisible ? 'select_input' : 'resolve_source'))
      errors.push('invalid HDMI clarification stage');
  }
  if (r.status === 'ready' || checkpoint) {
    if (!r.steps.length) errors.push('ready guide has no steps');
    if (r.clarification) errors.push('ready guide must not carry a clarification');
    if (r.unsupportedReason) errors.push('ready guide must not carry an unsupported reason');
    if (!checkpoint && !r.evidenceRefs.length) errors.push('ready guide must cite evidence');
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
