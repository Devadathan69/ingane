import { validateHotspot, validateText } from '../validate';
import { REGISTRY_VERSION, type PresetRegistry } from './types';

const present = (s: unknown) => typeof s === 'string' && !!s.trim();

export function validatePresetRegistry(data: PresetRegistry): string[] {
  const errors: string[] = [];
  const unique = (ids: string[], where: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!present(id) || seen.has(id)) errors.push(`${where}: missing or duplicate ID "${id}"`);
      seen.add(id);
    }
    return seen;
  };
  const requireRefs = (ids: string[], known: Set<string>, where: string) => {
    if (!ids.length) errors.push(`${where}: references required`);
    for (const id of unique(ids, where)) {
      if (!known.has(id)) errors.push(`${where}: unknown reference "${id}"`);
    }
  };
  if (data.version !== REGISTRY_VERSION) errors.push('Unsupported preset registry version');
  const records = [...data.remotes, ...data.tvs, ...data.guides];
  unique([...data.sources, ...records].map(r => r.id), 'registry');
  const sources = new Set(data.sources.map(s => s.id));
  for (const s of data.sources) {
    if (!present(s.title) || !present(s.location)) errors.push(`${s.id}: source title and location required`);
  }
  for (const r of records) {
    requireRefs(r.sourceIds, sources, r.id);
    if (r.status === 'device-verified') {
      const date = new Date(r.verifiedOn);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.verifiedOn) || !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== r.verifiedOn) errors.push(`${r.id}: device verification date required`);
    } else if (!['demo', 'draft'].includes(r.status) || r.verifiedOn !== null) {
      errors.push(`${r.id}: invalid verification status or date`);
    }
  }
  for (const r of [...data.remotes, ...data.tvs]) {
    if (!present(r.brand) || !/^[A-Z]{2}$/.test(r.market)) errors.push(`${r.id}: brand and market required`);
  }
  for (const r of data.remotes) {
    if (!present(r.partNumber)) errors.push(`${r.id}: remote part number required`);
    errors.push(...validateText(r.layoutVariant, `${r.id} layout`));
    const asset = r.asset;
    if (asset) {
      errors.push(...validateText(asset.alt, `${r.id} asset.alt`));
      if (!/^devices\/[\w-]+\.(jpg|jpeg|png|webp)$/i.test(asset.src) || !/^[a-f0-9]{64}$/i.test(asset.sha256) ||
          ![asset.width, asset.height].every(n => Number.isInteger(n) && n > 0)) errors.push(`${r.id}: invalid photo or dimensions`);
      if (!present(asset.rights) || !['local-demo', 'catalog'].includes(asset.usage) ||
          (r.status === 'device-verified' && asset.usage !== 'catalog')) errors.push(`${r.id}: photo rights required for this use`);
    } else if (r.status !== 'draft' || Object.keys(r.controls).length) {
      errors.push(`${r.id}: controls require an authorized photo`);
    }
    for (const [id, c] of Object.entries(r.controls)) {
      if (!present(id)) errors.push(`${r.id}: missing control ID`);
      errors.push(...validateText(c.label, `${r.id}.${id} label`));
      if (c.shortLabel) errors.push(...validateText(c.shortLabel, `${r.id}.${id} short label`));
      if (c.hotspot) errors.push(...validateHotspot(c.hotspot, `${r.id}.${id}`));
      else errors.push(`${r.id}.${id}: missing hotspot`);
    }
  }

  const remoteIds = new Set(data.remotes.map(r => r.id));
  for (const tv of data.tvs) {
    if (!present(tv.modelCode) || !present(tv.os) || (tv.status !== 'draft' && !present(tv.menuVariant))) {
      errors.push(`${tv.id}: exact model, OS and menu variant required`);
    }
    requireRefs(tv.remoteIds, remoteIds, tv.id);
    for (const remote of data.remotes.filter(r => tv.remoteIds.includes(r.id))) {
      if (tv.market !== remote.market) errors.push(`${tv.id}: remote market mismatch`);
    }
  }
  unique(data.guides.map(g => JSON.stringify([g.tvId, g.remoteId, g.task, g.status])), 'TV/layout/task');
  for (const g of data.guides) {
    const tv = data.tvs.find(t => t.id === g.tvId);
    const remote = data.remotes.find(r => r.id === g.remoteId);
    if (!tv || !remote || !tv.remoteIds.includes(g.remoteId)) errors.push(`${g.id}: unknown or incompatible TV/remote`);
    if (g.status !== 'draft' && (g.status !== tv?.status || g.status !== remote?.status)) {
      errors.push(`${g.id}: TV, layout and guide must have matching verification`);
    }
    errors.push(...validateText(g.title, `${g.id} title`), ...validateText(g.startingState, `${g.id} starting state`));
    if (g.playTitle) errors.push(...validateText(g.playTitle, `${g.id} player title`));
    if (!g.steps.length) errors.push(`${g.id}: steps required`);
    const stepIds = unique(g.steps.map(s => s.id), g.id);
    for (const s of g.steps) {
      if (!remote || !Object.hasOwn(remote.controls, s.controlId)) errors.push(`${g.id}.${s.id}: unknown control "${s.controlId}"`);
      if (!['press', 'rocker-press', 'double-press'].includes(s.gesture)) errors.push(`${g.id}.${s.id}: unknown gesture`);
      if (s.confirmation) errors.push(...validateText(s.confirmation, `${g.id}.${s.id} confirmation`));
      for (const field of ['instruction', 'narration', 'expected', 'recovery'] as const) {
        errors.push(...validateText(s[field], `${g.id}.${s.id} ${field}`));
        if (s[field]?.ml && !/[\u0D00-\u0D7F]/.test(s[field].ml)) errors.push(`${g.id}.${s.id} ${field}.ml: Malayalam copy required`);
      }
    }
    if (g.input.kind === 'hdmi-port') {
      const routes = Object.entries(g.input.routes);
      if (!routes.length) errors.push(`${g.id}: HDMI choices required`);
      for (const [port, ids] of routes) {
        if (!present(port) || port.length > 40) errors.push(`${g.id}: invalid port`);
        requireRefs(ids, stepIds, `${g.id} ${port}`);
      }
      const routed = new Set(routes.flatMap(([, ids]) => ids));
      if (g.steps.some(s => !routed.has(s.id))) errors.push(`${g.id}: step missing from all HDMI routes`);
    }
  }
  return errors;
}
