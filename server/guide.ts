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
import { buildHdmi } from './hdmi';
import { HDMI_COPY } from '../shared/hdmi-copy';
import { wifiCopy } from '../shared/wifi-copy';
import { blockedWifi, directWifi, enableOnly, wifiSteps } from './wifi';
import { troubleshooting } from './troubleshooting';
import { MESSAGES } from './messages';
import { approvedReferences, findReference, referenceApplies } from './references';
import { ProviderError, type GuideProviders, type NormalizedImage, type PlannerOutput, type RemoteObservation, type ScreenObservation } from './providers/types';
import { validateGuideResult, type ValidationContext } from './validate';

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
  screenImage?: NormalizedImage | (() => Promise<NormalizedImage>);
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
  const screenImage = input.screenImage;
  const readScreen = screenImage ? async () => deps.providers.analyzeScreen(
    typeof screenImage === 'function' ? await screenImage() : screenImage, deps.signal) : undefined;
  const task = input.request.trim();
  const wifiRequest = directWifi(task);
  const wifiBlocked = blockedWifi(task);
  const t = wifiCopy(locale);
  const imageHash = createHash('sha256').update(input.image.bytes).digest('hex');
  const taskHash = createHash('sha256').update(task).digest('hex');
  const key = imageHash + ':' + taskHash;
  let obs = deps.cache.get(key);
  if (!obs) {
    obs = await deps.providers.analyzeRemote(input.image, deps.signal, wifiRequest || wifiBlocked ? t.title : task);
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

  const rephrase = (question = t.clarify) => {
    const result = clarify('text', question);
    result.clarification!.editRequest = true;
    return result;
  };

  const poor = obs.photoQuality === 'blurry' || obs.photoQuality === 'too_dark';
  const photoIssue = (issue: 'not_remote' | 'blurry' | 'too_dark', question: string) => {
    const result = clarify('clearer_photo', question);
    result.clarification!.photoIssue = issue;
    return result;
  };
  if (!obs.isRemote) return photoIssue('not_remote', msg.notRemote);
  const poorPhoto = () => obs.photoQuality === 'too_dark'
    ? photoIssue('too_dark', HDMI_COPY[locale].dark) : photoIssue('blurry', HDMI_COPY[locale].blur);
  const observed = toControls(obs, {});
  if (poor && !observed.length) return poorPhoto();

  const photoId = createHmac('sha256', deps.secret).update(key + ':' + locale).digest('hex');
  const hdmi = () => {
    const bound = answers.hdmi?.photoId === photoId ? answers : {};
    // Only the explicit confirmation action can introduce a manual Source box.
    const layoutId = createHash('sha256').update(JSON.stringify(observed)).digest('hex');
    const sameLayout = bound.hdmi?.layoutId === layoutId;
    const sourceIds = observed.filter(c => c.role === 'input').map(c => c.id);
    const confirmed = (bound.confirmedControlIds ?? []).filter(id => (sameLayout && sourceIds.includes(id)) ||
      (bound.userControls?.some(mark => id === 'user_' + mark.id) && !observed.some(c => c.id === id)));
    const checked: ClarificationAnswers = { ...bound, confirmedControlIds: confirmed,
      rejectedControlIds: sameLayout ? bound.rejectedControlIds?.filter(id => sourceIds.includes(id)) : [],
      userControls: bound.userControls?.filter(mark => mark.role === 'input' && confirmed.includes('user_' + mark.id) &&
        !observed.some(c => c.role !== 'input' && c.confidence === 'high' && overlapRatio(c.bbox, mark.bbox) > OVERLAP_LIMIT)) };
    const grounded = toControls(obs, checked);
    const finish = (result: GuideResult, context: ValidationContext) => {
      result.narrationTokens = Object.fromEntries(result.steps.map(s => [s.id, narrationToken(deps.secret, locale, s.narration)]));
      const errors = validateGuideResult(result, context);
      if (errors.length) throw new ProviderError('malformed', errors.join(', '));
      return result;
    };
    return buildHdmi({ base: { ...base, observedControls: grounded }, request: task, photoId, layoutId, answers: checked,
      needsCheck: c => needsConfirmation(c, grounded, checked) || (c.role === 'input' && !confirmed.includes(c.id) &&
        grounded.some(other => other.id !== c.id && overlapRatio(c.bbox, other.bbox) > 0)),
      readScreen, finish });
  };
  if (answers.hdmi?.photoId === photoId) return hdmi();

  const wifi = async (): Promise<GuideResult> => {
    const enable = enableOnly(task);
    const wifiTask = { type: 'wifi' as const, summary: enable ? t.enableTitle : t.title };
    // Accept only controls located on this remote. Don't turn an arbitrary user-drawn mark
    // or a text-only bypass into a network navigation button.
    const allowed = new Set(observed.map(c => c.id));
    const checked = { confirmedControlIds: answers.confirmedControlIds?.filter(id => allowed.has(id)), rejectedControlIds: answers.rejectedControlIds };
    const grounded = toControls(obs, checked);
    const needScreen = () => ({ ...clarify('screen_photo', t.photo, null, wifiTask), observedControls: grounded });
    const screen = readScreen ? await readScreen() : undefined;
    if (screen?.wifiSensitive) {
      return { ...base, observedControls: grounded, status: 'advice', task: wifiTask, steps: [], evidenceRefs: [],
        clarification: null, unsupportedReason: null, advice: t.photo };
    }
    if (!screen && answers.mismatch) return needScreen();
    const next = wifiSteps(locale, grounded, screen, enable);
    if (!next) return needScreen();
    const needsCheck = next.check.find(c => needsConfirmation(c, grounded, checked));
    if (needsCheck) {
      return { ...clarify('confirm_button', msg.confirmButton(needsCheck.label), needsCheck.id, wifiTask), observedControls: grounded };
    }
    const evidenceRefs: EvidenceRef[] = next.label
      ? [{ id: 'screen-photo', title: 'Photo of the user’s TV screen', kind: 'screen' }]
      : [{ id: 'wifi-open-menu', title: findReference('wifi-open-menu')!.title, kind: 'generic' }];
    const narrationTokens = Object.fromEntries(next.steps.map(s => [s.id, narrationToken(deps.secret, locale, s.narration)]));
    const result: GuideResult = { ...base, observedControls: grounded, status: 'ready', task: wifiTask, evidenceRefs,
      steps: next.steps, clarification: null, unsupportedReason: null, narrationTokens, wifiAdvance: next.advance ? true : undefined };
    const errors = validateGuideResult(result, { screenLabels: next.label ? [next.label] : [] });
    if (errors.length) throw new ProviderError('malformed', errors.join(', '));
    return result;
  };
  if (wifiBlocked) return rephrase(t.blocked);
  if (wifiRequest) return wifi();

  const help = troubleshooting(locale, task);
  if (help) return { ...base, status: 'advice', task: { type: 'other', summary: '' }, steps: [], evidenceRefs: [],
    clarification: null, unsupportedReason: null, advice: help };

  let screenLabels: string[] = [];

  const roles = new Set(controls.map((c) => c.role));
  const families = base.deviceCandidates.map((d) => d.family);
  const refs = approvedReferences().filter((r) => referenceApplies(r, { roles, families, tvModel: answers.tvModel }));

  const plannerInput = {
    locale,
    request: input.request,
    controls: controls.map(({ id, label, role, confidence }) => ({ id, label, role, confidence })),
    deviceCandidates: base.deviceCandidates,
    references: refs.map(({ id, title, kind, content }) => ({ id, title, kind, content })),
    screen: null as ScreenObservation | null,
    tvModel: answers.tvModel,
    note: answers.note,
    mismatch: answers.mismatch,
  };

  const assemble = (plan: PlannerOutput): GuideResult => {
    const task = { type: plan.taskType, summary: plan.taskSummary.slice(0, 200) };
    const hasTaskControl = plan.taskType === 'restore_sound'
      ? controls.some(c => c.role === 'mute' || c.role === 'volume_up')
      : plan.taskType === 'go_home' ? controls.some(c => c.role === 'home') : true;
    if (poor && !hasTaskControl) return poorPhoto();
    if (plan.taskType === 'other') return rephrase();
    if (plan.decision === 'unsupported') {
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

    // Planner may only cite references the server offered for this device and task.
    for (const r of evidenceRefs) {
      if (r.kind !== 'screen' && !refs.some((a) => a.id === r.id && a.tasks.includes(plan.taskType))) throw new ProviderError('malformed', `cited reference ${r.id} was not offered`);
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
    let plan = await deps.providers.plan(attempt ? { ...plannerInput, repairErrors: errors } : plannerInput, deps.signal);
    if (plan.taskType === 'switch_hdmi') return hdmi();
    if (plan.taskType === 'wifi') return wifi();
    if (!attempt && readScreen && !answers.hdmi) {
      const screen = await readScreen();
      if (screen.isTvScreen && !screen.wifiSensitive) {
        screenLabels = screen.labels.map(l => l.trim()).filter(Boolean).slice(0, 30);
        plannerInput.screen = { ...screen, labels: screenLabels };
        plan = await deps.providers.plan(plannerInput, deps.signal);
        if (plan.taskType === 'switch_hdmi') return hdmi();
        if (plan.taskType === 'wifi') return wifi();
      }
    }
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
