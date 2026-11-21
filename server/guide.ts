import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  bboxErrors,
  overlapRatio,
  type ClarificationAnswers,
  type ControlRole,
  type EvidenceRef,
  type GuideLocale,
  type GuideResult,
  type ObservedControl,
} from '../shared/guide';
import { MESSAGES } from './messages';
import { approvedReferences, findReference, referenceApplies } from './references';
import { ProviderError, type GuideProviders, type NormalizedImage, type PlannerOutput, type RemoteObservation, type ScreenObservation } from './providers/types';
import { validateGuideResult } from './validate';

const DPAD: ControlRole[] = ['nav_ring', 'ok', 'up', 'down', 'left', 'right'];
const OVERLAP_LIMIT = 0.35;

/** Short-lived button observations for one photo and task. Keys contain only hashes. */
export class VisionCache {
  private map = new Map<string, { obs: RemoteObservation; at: number }>();
  constructor(private ttlMs = 15 * 60_000, private max = 100) {}
  get(key: string) {
    const hit = this.map.get(key);
    if (!hit || Date.now() - hit.at > this.ttlMs) return undefined;
    return hit.obs;
  }
  set(key: string, obs: RemoteObservation) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { obs, at: Date.now() });
  }
}

export function narrationToken(secret: string, locale: GuideLocale, text: string) {
  return createHmac('sha256', secret).update(`${locale}\n${text}`).digest('base64url');
}

export function verifyNarrationToken(secret: string, locale: GuideLocale, text: string, token: string) {
  const a = Buffer.from(narrationToken(secret, locale, text));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface BuildInput {
  image: NormalizedImage;
  screenImage?: NormalizedImage;
  request: string;
  locale: GuideLocale;
  answers: ClarificationAnswers;
}

export interface BuildDeps {
  providers: GuideProviders;
  cache: VisionCache;
  secret: string;
  signal: AbortSignal;
}

function toControls(obs: RemoteObservation, answers: ClarificationAnswers): ObservedControl[] {
  const out: ObservedControl[] = [];
  const seen = new Set<string>();
  const rejected = new Set(answers.rejectedControlIds ?? []);
  for (const c of obs.controls) {
    // A box that is not inside the image is not a visible button: drop it rather than draw it.
    if (bboxErrors(c.bbox, c.id).length) continue;
    let id = c.id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) || 'control';
    while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    if (rejected.has(id)) continue;
    out.push({ id, label: c.label.slice(0, 80), role: c.role, bbox: c.bbox, confidence: c.confidence, source: 'vision', display: 'box' });
  }
  for (const u of answers.userControls ?? []) {
    if (bboxErrors(u.bbox, u.id).length) continue;
    const id = `user_${u.id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 30)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: u.label, role: u.role, bbox: u.bbox, confidence: 'high', source: 'user', display: 'box' });
  }
  const confirmed = new Set(answers.confirmedControlIds ?? []);
  const textOnly = new Set(answers.textOnlyControlIds ?? []);
  return out.map((c) => ({
    ...c,
    confidence: confirmed.has(c.id) ? 'high' : c.confidence,
    display: textOnly.has(c.id) ? 'text_only' : c.display,
  }));
}

/** A control needs the user's confirmation before we outline it as "the" button. */
export function needsConfirmation(c: ObservedControl, all: ObservedControl[], answers: ClarificationAnswers): boolean {
  if (c.source === 'user' || c.display === 'text_only' || answers.confirmedControlIds?.includes(c.id)) return false;
  if (c.confidence !== 'high') return true;
  return all.some(
    (o) => o.id !== c.id && o.display === 'box' && !(DPAD.includes(o.role) && DPAD.includes(c.role)) && overlapRatio(c.bbox, o.bbox) > OVERLAP_LIMIT,
  );
}

export async function buildGuide(input: BuildInput, deps: BuildDeps): Promise<GuideResult> {
  const { locale, answers } = input;
  const msg = MESSAGES[locale];
  const task = input.request.trim();
  const imageHash = createHash('sha256').update(input.image.bytes).digest('hex');
  const taskHash = createHash('sha256').update(task).digest('hex');
  const key = imageHash + ':' + taskHash;
  let obs = deps.cache.get(key);
  if (!obs) {
    obs = await deps.providers.analyzeRemote(input.image, deps.signal, task);
    deps.cache.set(key, obs);
  }

  const controls = toControls(obs, answers);
  const base = {
    locale,
    deviceCandidates: obs.deviceCandidates.slice(0, 5).map((d) => ({ family: d.family.slice(0, 80), confidence: d.confidence, basis: d.basis.slice(0, 200) })),
    observedControls: controls,
    image: { width: input.image.width, height: input.image.height },
    demo: deps.providers.name === 'mock',
    narrationTokens: {} as Record<string, string>,
  };
  const clarify = (kind: NonNullable<GuideResult['clarification']>['kind'], question: string, controlId: string | null = null, task: GuideResult['task'] = { type: 'other', summary: '' }): GuideResult => ({
    ...base, status: 'needs_clarification', task, evidenceRefs: [], steps: [], clarification: { kind, question, controlId }, unsupportedReason: null,
  });

  if (!obs.isRemote) return clarify('clearer_photo', msg.notRemote);
  const userHelped = !!(answers.userControls?.length || answers.confirmedControlIds?.length);
  if ((obs.photoQuality === 'blurry' || obs.photoQuality === 'too_dark') && !userHelped) return clarify('clearer_photo', msg.clearerPhoto);

  let screen: ScreenObservation | null = null;
  if (input.screenImage) {
    screen = await deps.providers.analyzeScreen(input.screenImage, deps.signal);
    if (!screen.isTvScreen) screen = null;
  }
  const screenLabels = (screen?.labels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 30);

  const roles = new Set(controls.map((c) => c.role));
  const families = base.deviceCandidates.map((d) => d.family);
  const refs = approvedReferences().filter((r) => referenceApplies(r, { roles, families, tvModel: answers.tvModel }));

  const plannerInput = {
    locale,
    request: input.request,
    controls: controls.map(({ id, label, role, confidence }) => ({ id, label, role, confidence })),
    deviceCandidates: base.deviceCandidates,
    references: refs.map(({ id, title, kind, content }) => ({ id, title, kind, content })),
    screen: screen ? { ...screen, labels: screenLabels } : null,
    tvModel: answers.tvModel,
    note: answers.note,
    mismatch: answers.mismatch,
  };

  const assemble = (plan: PlannerOutput): GuideResult => {
    const task = { type: plan.taskType, summary: plan.taskSummary.slice(0, 200) };
    if (plan.taskType === 'wifi') return { ...base, status: 'unsupported', task, evidenceRefs: [], steps: [], clarification: null, unsupportedReason: msg.wifi };
    if (plan.taskType === 'other' || plan.decision === 'unsupported') {
      return { ...base, status: 'unsupported', task, evidenceRefs: [], steps: [], clarification: null, unsupportedReason: (plan.unsupportedReason || msg.other).slice(0, 400) };
    }
    if (plan.decision === 'needs_clarification') {
      const c = plan.clarification;
      const controlId = c?.controlId && controls.some((x) => x.id === c.controlId) ? c.controlId : null;
      if (!c || (c.kind === 'confirm_button' && !controlId)) return clarify('text', msg.other, null, task);
      return clarify(c.kind, c.question.slice(0, 300), controlId, task);
    }

    const usedScreen = plan.steps.some((s) => s.screenLabel);
    const evidenceRefs: EvidenceRef[] = plan.evidenceRefIds.map((id) => {
      const ref = findReference(id);
      return { id, title: ref?.title ?? id, kind: ref?.kind ?? 'generic' };
    });
    if (usedScreen) evidenceRefs.push({ id: 'screen-photo', title: 'Photo of the user’s TV screen', kind: 'screen' });

    if (plan.taskType === 'switch_hdmi') {
      const modelRef = evidenceRefs.some((r) => r.kind === 'model' && refs.some((a) => a.id === r.id));
      if (!modelRef && !usedScreen) return clarify('screen_photo', msg.hdmiNeedsEvidence, null, task);
    }
    // Planner may only cite references the server offered for this device and task.
    for (const r of evidenceRefs) {
      if (r.kind !== 'screen' && !refs.some((a) => a.id === r.id)) throw new ProviderError('malformed', `cited reference ${r.id} was not offered`);
    }

    for (const s of plan.steps) {
      const c = s.controlId ? controls.find((x) => x.id === s.controlId) : undefined;
      if (c && needsConfirmation(c, controls, answers)) return clarify('confirm_button', msg.confirmButton(c.label), c.id, task);
    }

    const steps = plan.steps.map((s) => ({
      id: s.id.slice(0, 40),
      controlId: s.controlId,
      screenLabel: s.screenLabel?.trim() || null,
      instruction: s.instruction.trim(),
      narration: s.narration.trim(),
      expectedState: s.expectedState.trim(),
      mismatchRecovery: s.mismatchRecovery.trim(),
    }));
    const narrationTokens = Object.fromEntries(steps.map((s) => [s.id, narrationToken(deps.secret, locale, s.narration)]));
    return { ...base, status: 'ready', task, evidenceRefs, steps, clarification: null, unsupportedReason: null, narrationTokens };
  };

  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const plan = await deps.providers.plan(attempt ? { ...plannerInput, repairErrors: errors } : plannerInput, deps.signal);
    let result: GuideResult;
    try {
      result = assemble(plan);
    } catch (err) {
      if (!(err instanceof ProviderError) || err.code !== 'malformed') throw err;
      errors = [err.message];
      continue;
    }
    errors = validateGuideResult(result, { screenLabels });
    if (!errors.length) return result;
  }
  throw new ProviderError('malformed', `guide failed validation: ${errors.slice(0, 5).join('; ')}`);
}
