import { DEVICES } from './devices';
import { GUIDES } from './guides';
import type { Device, Guide } from './types';
import { validateGuide } from './validate';

export { DEVICES, GUIDES };
export * from './types';

export type GuideLookup =
  | { ok: true; guide: Guide; device: Device }
  | { ok: false; reason: 'missing' | 'unknown' | 'invalid'; id?: string; errors?: string[] };

export function lookupGuide(id: string | null | undefined): GuideLookup {
  if (!id) return { ok: false, reason: 'missing' };
  const guide = Object.prototype.hasOwnProperty.call(GUIDES, id) ? GUIDES[id] : undefined;
  if (!guide) return { ok: false, reason: 'unknown', id };
  const errors = validateGuide(guide, DEVICES);
  if (errors.length) return { ok: false, reason: 'invalid', id, errors };
  return { ok: true, guide, device: DEVICES[guide.deviceId] };
}
