import type { Locale, LocalizedText } from '../types';
import type { CatalogEntry, CatalogScope, PresetRegistry, PresetStep, TaskGuide } from './types';
import { validatePresetRegistry } from './validate';

/** Join only explicitly authored TV/layout/task combinations from the requested collection. */
export function catalogEntries(data: PresetRegistry, scope: CatalogScope): CatalogEntry[] {
  if (validatePresetRegistry(data).length) return [];
  const entries: CatalogEntry[] = [];
  for (const tv of data.tvs.filter(t => t.status === scope)) {
    for (const remoteId of tv.remoteIds) {
      const remote = data.remotes.find(r => r.id === remoteId && r.status === scope);
      if (!remote?.asset) continue;
      const guides = data.guides.filter(g => g.tvId === tv.id && g.remoteId === remoteId && g.status === scope);
      if (guides.length) entries.push({ tv, remote: { ...remote, asset: remote.asset }, guides });
    }
  }
  return entries;
}

/** Port values come from the printed-label choices for this guide. No default port. */
export function stepsFor(guide: TaskGuide, port: string | null): PresetStep[] | undefined {
  if (guide.input.kind === 'none') return port === null ? guide.steps : undefined;
  if (!port || !Object.hasOwn(guide.input.routes, port)) return undefined;
  return guide.input.routes[port].map(id => guide.steps.find(s => s.id === id)!);
}

export function presetText(copy: LocalizedText, locale: Locale, port: string | null) {
  return copy[locale].replaceAll('{port}', port ?? '');
}

/** Both the picker cover and its opt-in link use this same authored practice route. */
export function hdmiDemo(data: PresetRegistry) {
  const entry = catalogEntries(data, 'demo').find(e => e.tv.id === 'demo-tv' && e.remote.id === 'coolux-practice-layout');
  const guide = entry?.guides.find(g => g.id === 'demo-hdmi');
  const port = 'HDMI 2';
  const first = guide && stepsFor(guide, port)?.[0];
  if (entry && guide && first) return { entry, guide, port, control: entry.remote.controls[first.controlId] };
}
