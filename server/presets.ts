import { z } from 'zod';
import { catalogEntries, presetText, stepsFor } from '../src/data/presets/catalog';
import { presetRegistry } from '../src/data/presets/registry';
import { REGISTRY_VERSION } from '../src/data/presets/types';
import type { GuideLocale } from '../shared/guide';

const selector = z.strictObject({
  version: z.literal(REGISTRY_VERSION), scope: z.enum(['device-verified', 'demo']),
  guideId: z.string(), stepId: z.string(), port: z.string().max(40).nullable(),
});
const collections = {
  'device-verified': catalogEntries(presetRegistry, 'device-verified'),
  demo: catalogEntries(presetRegistry, 'demo'),
};

/** Resolve only an authored step on the selected route. User text never enters preset speech. */
export function presetNarration(input: unknown, locale: GuideLocale): string | undefined {
  const parsed = selector.safeParse(input);
  if (!parsed.success) return undefined;
  const { scope, guideId, port, stepId } = parsed.data;
  for (const entry of collections[scope]) {
    const guide = entry.guides.find(g => g.id === guideId);
    if (!guide) continue;
    const step = stepsFor(guide, port)?.find(s => s.id === stepId);
    return step && presetText(step.narration, locale, port);
  }
  return undefined;
}
