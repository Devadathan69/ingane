import type { ControlRole, TaskType } from '../shared/guide';

/**
 * Server-supplied evidence. A photo shows which buttons exist; it does not establish the TV
 * model or menu path. Device-specific steps must cite an APPROVED reference here (or a photo of
 * the user's current TV screen). Drafts are never offered to the planner.
 */
export interface Reference {
  id: string;
  title: string;
  kind: 'generic' | 'model';
  status: 'approved' | 'draft';
  tasks: TaskType[];
  /** Roles that must be visible on the remote photo for this reference to apply. */
  requiresAnyRole: ControlRole[];
  /** Model-specific refs: which remote families / TV models they apply to (case-insensitive substring). */
  appliesTo?: { remoteFamilies?: string[]; tvModels?: string[] };
  /** Text the planner may rely on. Keep it factual and short. */
  content: string;
}

export const REFERENCES: Reference[] = [
  {
    id: 'generic-sound',
    title: 'Restoring sound with clearly labelled mute / volume buttons',
    kind: 'generic',
    status: 'approved',
    tasks: ['restore_sound'],
    requiresAnyRole: ['mute', 'volume_up'],
    content:
      'On almost every TV remote, a button printed with a crossed-out speaker toggles mute, and a button ' +
      'printed with + next to a speaker (or VOL +) raises the volume. Pressing either usually shows a volume ' +
      'bar or speaker icon on the TV. If a crossed-out speaker icon is on screen, press Mute once; otherwise ' +
      'press Volume + a few times, one press at a time. This only applies when those printed symbols are clearly visible.',
  },
  {
    id: 'generic-home',
    title: 'Returning to the home screen with a house-icon button',
    kind: 'generic',
    status: 'approved',
    tasks: ['go_home'],
    requiresAnyRole: ['home'],
    content:
      'On smart-TV remotes, a button printed with a house icon (or the word HOME) opens the TV home screen ' +
      'with rows of apps. Press it once. This only applies when the house icon or HOME label is clearly visible.',
  },
  {
    id: 'example-input-draft',
    title: 'Example input menu awaiting hardware verification',
    kind: 'model', status: 'draft', tasks: ['switch_hdmi'], requiresAnyRole: ['input'],
    appliesTo: { tvModels: ['DEMO-TV-01'] },
    content: 'Practice menu only. Hardware evidence is required before approving a TV menu route.',
  },
];

export function approvedReferences(): Reference[] {
  return REFERENCES.filter((r) => r.status === 'approved');
}

export function findReference(id: string): Reference | undefined {
  return REFERENCES.find((r) => r.id === id);
}

export function referenceApplies(
  ref: Reference,
  ctx: { roles: Set<ControlRole>; families: string[]; tvModel?: string },
): boolean {
  if (ref.status !== 'approved') return false;
  if (!ref.requiresAnyRole.some((r) => ctx.roles.has(r))) return false;
  if (ref.kind === 'generic') return true;
  const hay = [...ctx.families, ctx.tvModel ?? ''].map((s) => s.toLowerCase());
  const needles = [...(ref.appliesTo?.remoteFamilies ?? []), ...(ref.appliesTo?.tvModels ?? [])].map((s) => s.toLowerCase());
  return needles.some((n) => hay.some((h) => h && h.includes(n)));
}
