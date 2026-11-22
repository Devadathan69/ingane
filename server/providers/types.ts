import type { BBox, ControlRole, DeviceCandidate, GuideLocale, TaskType } from '../../shared/guide';

export interface NormalizedImage {
  bytes: Buffer;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
}

export interface VisionControl {
  id: string;
  label: string;
  role: ControlRole;
  bbox: BBox;
  confidence: 'high' | 'medium' | 'low';
}

export interface RemoteObservation {
  isRemote: boolean;
  photoQuality: 'good' | 'blurry' | 'partial' | 'too_dark';
  controls: VisionControl[];
  deviceCandidates: DeviceCandidate[];
}

export interface ScreenObservation {
  isTvScreen: boolean;
  isInputList: boolean;
  selectedLabel: string | null;
  /** Exact on-screen text labels as printed, e.g. "HDMI 1". */
  labels: string[];
  summary: string;
  /** Credentials, pairing codes, or keyboard for entering a network password. */
  wifiSensitive?: boolean;
}

export interface PlannerStep {
  id: string;
  controlId: string | null;
  screenLabel: string | null;
  instruction: string;
  narration: string;
  expectedState: string;
  mismatchRecovery: string;
}

export interface PlannerOutput {
  taskType: TaskType;
  taskSummary: string;
  decision: 'ready' | 'needs_clarification' | 'unsupported';
  clarification: { kind: 'tv_model' | 'clearer_photo' | 'screen_photo' | 'confirm_button' | 'text'; question: string; controlId: string | null } | null;
  unsupportedReason: string | null;
  evidenceRefIds: string[];
  steps: PlannerStep[];
}

export interface PlannerInput {
  locale: GuideLocale;
  request: string;
  controls: { id: string; label: string; role: ControlRole; confidence: string }[];
  deviceCandidates: DeviceCandidate[];
  references: { id: string; title: string; kind: string; content: string }[];
  screen: ScreenObservation | null;
  tvModel?: string;
  note?: string;
  mismatch?: { stepId: string; expected: string };
  /** Validation errors from a previous attempt, for one repair pass. */
  repairErrors?: string[];
}

export interface GuideProviders {
  name: 'live' | 'mock';
  analyzeRemote(img: NormalizedImage, signal: AbortSignal, request?: string): Promise<RemoteObservation>;
  analyzeScreen(img: NormalizedImage, signal: AbortSignal): Promise<ScreenObservation>;
  plan(input: PlannerInput, signal: AbortSignal): Promise<PlannerOutput>;
}

export interface SpeechProviders {
  name: 'live' | 'mock';
  transcribe(audio: { bytes: Buffer; mime: string }, locale: GuideLocale, signal: AbortSignal): Promise<string>;
  /** Returns WAV bytes. */
  synthesize(text: string, locale: GuideLocale, signal: AbortSignal): Promise<Buffer>;
}

/** Thrown for anything a user can act on; message keys are localized by the API layer. */
export class ProviderError extends Error {
  constructor(
    public readonly code: 'refusal' | 'malformed' | 'timeout' | 'unavailable' | 'not_configured' | 'rejected',
    message: string,
  ) {
    super(message);
  }
}
