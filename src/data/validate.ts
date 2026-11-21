import { LOCALES, type Device, type Guide, type Hotspot, type LocalizedText } from './types';

const isUnit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

export function validateHotspot(h: Hotspot, where: string): string[] {
  const errors: string[] = [];
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    if (!isUnit(h[k])) errors.push(`${where}: hotspot.${k} must be a finite number in [0,1]`);
  }
  if (errors.length) return errors;
  if (h.w <= 0 || h.h <= 0) errors.push(`${where}: hotspot size must be positive`);
  if (h.x + h.w > 1 + 1e-9) errors.push(`${where}: hotspot x+w exceeds 1`);
  if (h.y + h.h > 1 + 1e-9) errors.push(`${where}: hotspot y+h exceeds 1`);
  return errors;
}

export function validateText(t: LocalizedText | undefined, where: string): string[] {
  if (!t) return [`${where}: missing`];
  return LOCALES.filter((l) => typeof t[l] !== 'string' || !t[l].trim()).map((l) => `${where}.${l}: required`);
}

export function validateGuide(g: Guide, devices: Record<string, Device>): string[] {
  const errors: string[] = [];
  const at = `guide ${g.id || '(no id)'}`;
  if (!g.id) errors.push(`${at}: id required`);
  if (!devices[g.deviceId]) errors.push(`${at}: unknown deviceId "${g.deviceId}"`);
  if (g.verification !== 'unverified' && g.verification !== 'verified') errors.push(`${at}: bad verification status`);
  errors.push(...validateText(g.title, `${at} title`));
  errors.push(...validateText(g.verificationNote, `${at} verificationNote`));
  errors.push(...validateText(g.startingScreen, `${at} startingScreen`));
  if (!g.steps?.length) errors.push(`${at}: needs at least one step`);
  const seen = new Set<string>();
  g.steps?.forEach((s, i) => {
    const where = `${at} step ${i + 1} (${s.id || 'no id'})`;
    if (!s.id) errors.push(`${where}: id required`);
    else if (seen.has(s.id)) errors.push(`${where}: duplicate step id`);
    seen.add(s.id);
    if (!s.image) errors.push(`${where}: image required`);
    if (s.hotspot) errors.push(...validateHotspot(s.hotspot, where));
    for (const k of ['button', 'instruction', 'expected', 'recovery'] as const) {
      errors.push(...validateText(s[k], `${where} ${k}`));
    }
  });
  return errors;
}
