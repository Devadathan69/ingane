import { z } from 'zod';
import { guideLanguages } from './languages';

/** Shared V2 contract between server and client. The client only imports types from here. */

export const LOCALE = z.enum(guideLanguages);
export type GuideLocale = z.infer<typeof LOCALE>;

export const TASK_TYPES = ['restore_sound', 'go_home', 'switch_hdmi', 'wifi', 'other'] as const;
export const TaskType = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof TaskType>;

export const CONTROL_ROLES = [
  'power', 'mute', 'volume_up', 'volume_down', 'home', 'back', 'input', 'ok', 'up', 'down', 'left', 'right',
  'nav_ring', 'settings', 'menu', 'channel_up', 'channel_down', 'number', 'app', 'voice', 'other',
] as const;
export const ControlRole = z.enum(CONTROL_ROLES);
export type ControlRole = z.infer<typeof ControlRole>;

export const BBox = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type BBox = z.infer<typeof BBox>;

export const ObservedControl = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  role: ControlRole,
  bbox: BBox,
  confidence: z.enum(['high', 'medium', 'low']),
  /** vision = proposed by the model; user = marked by the user tapping the photo. */
  source: z.enum(['vision', 'user']),
  /** box = safe to outline; text_only = name it in text, never draw a box. */
  display: z.enum(['box', 'text_only']),
});
export type ObservedControl = z.infer<typeof ObservedControl>;

export const DeviceCandidate = z.object({
  family: z.string().min(1).max(80),
  confidence: z.enum(['high', 'medium', 'low']),
  basis: z.string().max(200),
});
export type DeviceCandidate = z.infer<typeof DeviceCandidate>;

export const EvidenceRef = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['generic', 'model', 'screen']),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const GuideStep = z.object({
  id: z.string().min(1).max(40),
  controlId: z.string().nullable(),
  screenLabel: z.string().max(60).nullable(),
  instruction: z.string().min(1).max(400),
  narration: z.string().min(1).max(500),
  expectedState: z.string().min(1).max(300),
  mismatchRecovery: z.string().min(1).max(400),
});
export type GuideStep = z.infer<typeof GuideStep>;

export const CLARIFICATION_KINDS = ['tv_model', 'clearer_photo', 'screen_photo', 'confirm_button', 'text'] as const;
export const Clarification = z.object({
  kind: z.enum([...CLARIFICATION_KINDS, 'mark_source', 'input_list', 'choose_input']),
  photoIssue: z.enum(['not_remote', 'blurry', 'too_dark']).optional(),
  question: z.string().min(1).max(300),
  controlId: z.string().nullable(),
});
export type Clarification = z.infer<typeof Clarification>;

const visibleLabels = z.array(z.string().trim().min(1).max(60)).max(30);
const photoId = z.string().regex(/^[a-f0-9]{64}$/);
/** Issued for this remote observation, request and language. Only an acknowledged list permits selection. */
export const HdmiContinuation = z.object({
  photoId,
  layoutId: photoId,
  stage: z.enum(['resolve_source', 'await_input_list', 'select_input']),
  labels: visibleLabels,
});

export const GuideResult = z.object({
  status: z.enum(['ready', 'hdmi_checkpoint', 'needs_clarification', 'unsupported']),
  task: z.object({ type: TaskType, summary: z.string().max(200) }),
  locale: LOCALE,
  deviceCandidates: z.array(DeviceCandidate).max(5),
  observedControls: z.array(ObservedControl).max(60),
  evidenceRefs: z.array(EvidenceRef).max(10),
  steps: z.array(GuideStep).max(12),
  clarification: Clarification.nullable(),
  hdmi: HdmiContinuation.optional(),
  unsupportedReason: z.string().max(400).nullable(),
  /** HMAC tokens that let /api/speak narrate only server-issued step text. Keyed by step id. */
  narrationTokens: z.record(z.string(), z.string()),
  image: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  /** true when produced by the mock provider (demo data, not live inference). */
  demo: z.boolean(),
});
export type GuideResult = z.infer<typeof GuideResult>;

/** What the client sends back when answering a clarification. */
export const ClarificationAnswers = z.object({
  tvModel: z.string().max(80).optional(),
  hdmi: z.object({
    photoId,
    layoutId: photoId.optional(),
    listVisible: z.boolean().optional(),
    typedLabels: visibleLabels.optional(),
    target: z.string().trim().min(1).max(60).optional(),
  }).optional(),
  confirmedControlIds: z.array(z.string().max(40)).max(20).optional(),
  textOnlyControlIds: z.array(z.string().max(40)).max(20).optional(),
  /** The user said the proposed box is not that button: drop it entirely. */
  rejectedControlIds: z.array(z.string().max(40)).max(20).optional(),
  userControls: z
    .array(z.object({ id: z.string().max(40), label: z.string().max(80), role: ControlRole, bbox: BBox }))
    .max(5)
    .optional(),
  note: z.string().max(300).optional(),
  mismatch: z.object({ stepId: z.string().max(40), expected: z.string().max(300) }).optional(),
});
export type ClarificationAnswers = z.infer<typeof ClarificationAnswers>;

export const MALAYALAM_SCRIPT = /[\u0D00-\u0D7F]/;

export function bboxErrors(b: BBox, where: string): string[] {
  const e: string[] = [];
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    if (!Number.isFinite(b[k]) || b[k] < 0 || b[k] > 1) e.push(`${where}: ${k} must be finite in [0,1]`);
  }
  if (e.length) return e;
  if (b.w <= 0 || b.h <= 0) e.push(`${where}: size must be positive`);
  if (b.x + b.w > 1 + 1e-9 || b.y + b.h > 1 + 1e-9) e.push(`${where}: box extends outside the image`);
  return e;
}

/** Intersection area divided by the smaller box's area. */
export function overlapRatio(a: BBox, b: BBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const min = Math.min(a.w * a.h, b.w * b.h);
  return min > 0 ? (ix * iy) / min : 0;
}
