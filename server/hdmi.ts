import { overlapRatio } from '../shared/guide';
import type { Clarification, ClarificationAnswers, GuideResult, GuideStep, ObservedControl } from '../shared/guide';
import { HDMI_COPY, hdmiText } from '../shared/hdmi-copy';
import type { ScreenObservation } from './providers/types';
import type { ValidationContext } from './validate';

type Base = Pick<GuideResult, 'locale' | 'deviceCandidates' | 'observedControls' | 'image' | 'demo' | 'narrationTokens'>;

export function isMenuOpener(c: ObservedControl) {
  // An HDMI shortcut, generic menu or power key is not evidence of an input-list opener.
  return c.role === 'input' && c.display === 'box' && !/power|standby|⏻|^(menu|home|ok|netflix)$/i.test(c.label.trim()) &&
    (!/HDMI/i.test(c.label) || /source|input/i.test(c.label));
}

export function hasSourceLabel(c: ObservedControl) {
  return /source|input|TV\s*\/\s*AV|rectangle.with.arrow|arrow.*(?:box|screen|rectangle)|plug|ഇൻപുട്ട്|ഇന്‍പുട്ട്|സോഴ്‌സ്|सोर्स|इनपुट|உள்ளீடு|ಇನ್‌ಪುಟ್|ఇన్‌పుట్/i.test(c.label);
}

/** Only a distinctly boxed OK key or the centre inside its surrounding ring can be named. */
export function selectKey(controls: ObservedControl[]) {
  const keys = controls.filter(c => c.role === 'ok');
  if (keys.length !== 1) return undefined;
  const key = keys[0];
  if (key.confidence !== 'high' || key.display !== 'box' || !/\b(?:ok|select|enter|confirm)\b|checkmark|check mark|[✓✔]/i.test(key.label)) return undefined;
  const conflict = controls.some(other => {
    if (other.id === key.id || other.display !== 'box') return false;
    const overlap = overlapRatio(key.bbox, other.bbox);
    const enclosingRing = other.role === 'nav_ring' && overlap > .99 && other.bbox.w > key.bbox.w && other.bbox.h > key.bbox.h;
    return overlap > 0 && !enclosingRing;
  });
  return conflict ? undefined : key;
}

interface HdmiInput {
  base: Base;
  request: string;
  photoId: string;
  layoutId: string;
  answers: ClarificationAnswers;
  readScreen?: () => Promise<ScreenObservation>;
  needsCheck: (control: ObservedControl) => boolean;
  finish: (result: GuideResult, evidence: ValidationContext) => GuideResult;
}

function portNumber(text: string) {
  // Compare port numbers while keeping the original menu spelling for display and narration.
  const digits = text.normalize('NFKC').replace(/[०-९௦-௯೦-೯౦-౯൦-൯]/g, c => String((c.charCodeAt(0) & 15) - 6));
  const ports = new Set(Array.from(digits.matchAll(/\bHDMI[\s_-]*(\d+)/gi), match => match[1]));
  return ports.size === 1 ? [...ports][0] : undefined;
}

export async function buildHdmi({ base, request, photoId, layoutId, answers, readScreen, needsCheck, finish }: HdmiInput) {
  const t = HDMI_COPY[base.locale];
  const controls = base.observedControls;
  const task = { type: 'switch_hdmi' as const, summary: t.title };
  const initial: GuideResult = { ...base, task, status: 'needs_clarification', steps: [], evidenceRefs: [], clarification: null, unsupportedReason: null };
  const evidence: ValidationContext = { screenLabels: [], hdmiPhotoId: photoId, confirmed: answers.confirmedControlIds ?? [], listVisible: answers.hdmi?.listVisible === true };
  const clarify = (stage: 'resolve_source' | 'select_input', kind: Clarification['kind'], question: string, controlId: string | null = null) =>
    finish({ ...initial, hdmi: { stage, photoId, layoutId, labels: evidence.screenLabels }, clarification: { kind, question, controlId } }, evidence);

  if (!evidence.listVisible) {
    const sources = controls.filter(isMenuOpener);
    const confirmed = sources.filter(c => evidence.confirmed?.includes(c.id));
    const source = confirmed.length === 1 ? confirmed[0] : sources.length === 1 ? sources[0] : undefined;
    if (!source) {
      return clarify('resolve_source', 'mark_source', t.sourceMissing);
    }
    if (needsCheck(source) || (!hasSourceLabel(source) && !confirmed.length)) return clarify('resolve_source', 'confirm_button', t.sourceConfirm, source.id);
    const instruction = hdmiText(t.press, source.label);
    const step: GuideStep = { id: 'open-input-list', controlId: source.id, screenLabel: null, instruction,
      narration: instruction + ' ' + t.listExpected, expectedState: t.listExpected, mismatchRecovery: t.checkSource };
    return finish({ ...initial, status: 'hdmi_checkpoint', hdmi: { stage: 'await_input_list', photoId, layoutId, labels: [] }, steps: [step] }, evidence);
  }

  evidence.selectedLabel = null;
  const typed = answers.hdmi?.typedLabels;
  if (typed?.length) {
    evidence.screenLabels = [...new Set(typed)];
    evidence.inputEvidence = 'typed-inputs';
  } else if (readScreen) {
    const screen = await readScreen();
    if (screen.isTvScreen && screen.isInputList) {
      evidence.screenLabels = [...new Set(screen.labels.map(l => l.trim()).filter(l => l && l.length <= 60))].slice(0, 30);
      if (screen.selectedLabel && evidence.screenLabels.includes(screen.selectedLabel)) evidence.selectedLabel = screen.selectedLabel;
      evidence.inputEvidence = 'screen-photo';
    }
  }
  const labels = evidence.screenLabels;
  if (!labels.length) return clarify('select_input', 'input_list', readScreen ? t.unreadableList : t.listTitle);
  const requestedPort = portNumber(request);
  const matches = requestedPort ? labels.filter(l => portNumber(l) === requestedPort) : [];
  const choice = answers.hdmi?.target;
  const target = choice ? labels.find(l => l === choice) : matches.length === 1 ? matches[0] : undefined;
  if (!target) return clarify('select_input', 'choose_input', t.target);

  const steps: GuideStep[] = [];
  const step = (id: string, instruction: string, expectedState: string, controlId: string | null = null): GuideStep =>
    ({ id, controlId, screenLabel: target, instruction, narration: instruction, expectedState, mismatchRecovery: t.recheckList });
  if (evidence.selectedLabel !== target) {
    steps.push(step('highlight-input', hdmiText(t.highlight, target), hdmiText(t.highlighted, target)));
  }
  const ok = selectKey(controls);
  steps.push(step('select-input', hdmiText(ok ? t.selectKey : t.select, target, ok?.label), t.picture, ok?.id));
  return finish({ ...initial, status: 'ready', steps, hdmi: { stage: 'select_input', photoId, layoutId, labels },
    evidenceRefs: [{ id: evidence.inputEvidence!, kind: 'screen', title: typed?.length ? t.typedEvidence : t.photoEvidence }] }, evidence);
}
