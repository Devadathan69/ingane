import { useEffect, useMemo, useRef, useState } from 'react';
import { catalogEntries, hdmiDemo, stepsFor } from '../data/presets/catalog';
import { presetRegistry } from '../data/presets/registry';
import type { CatalogEntry, CatalogScope, PresetRegistry, TaskGuide, TvProfile } from '../data/presets/types';
import type { Locale } from '../data/types';
import { authoredLocale, authoredLocales, languages, type AuthoredLocale } from '../../shared/languages';
import { findBrand, tvBrands } from '../data/brand-guides';
import { BrandTiles, ManufacturerGuides } from './BrandTiles';
import { BRAND_COPY } from './brand-strings';
import { STRINGS } from '../i18n';
import { PhotoLink, PresetPlayer } from './PresetPlayer';
import { PRESET_STRINGS } from './strings';
import { FAMILY } from '../family/strings';
import type { FamilySeed } from '../family/draft';
import { FlowHeading, Icon } from '../ui/Icon';

type Screen =
  | { kind: 'brands' }
  | { kind: 'models'; brand: string }
  | { kind: 'remotes'; tv: TvProfile; task?: TaskGuide['task'] }
  | { kind: 'tasks'; entry: CatalogEntry; task?: TaskGuide['task'] }
  | { kind: 'play'; entry: CatalogEntry; guide: TaskGuide; port: string | null };

interface Props {
  locale: Locale;
  registry?: PresetRegistry;
  demoHdmi2?: boolean;
  brandId?: string | null;
  onFamily?: (seed: FamilySeed) => void;
}

const root: Screen = { kind: 'brands' };
const tvVariant = (tv: TvProfile) => [tv.market, tv.os, tv.menuVariant].filter(Boolean).join(' · ');

export function Library({ locale, registry = presetRegistry, onFamily, demoHdmi2 = false, brandId = null }: Props) {
  const [chosenLanguage, setGuideLanguage] = useState<AuthoredLocale | null>(null);
  const guideLanguage = chosenLanguage ?? authoredLocale(locale);
  const [trail, setTrail] = useState<Screen[]>(() => {
    if (!demoHdmi2) {
      const brand = findBrand(brandId);
      return brand ? [root, { kind: 'models', brand: brand.name }] : [root];
    }
    const demo = hdmiDemo(registry);
    if (!demo) return [root];
    const { entry, guide, port } = demo;
    return [root, { kind: 'models', brand: entry.tv.brand }, { kind: 'remotes', tv: entry.tv },
      { kind: 'tasks', entry, task: guide.task }, { kind: 'play', entry, guide, port }];
  });
  const [scope, setScope] = useState<CatalogScope>(demoHdmi2 && trail.length > 1 ? 'demo' : 'device-verified');
  const screen = trail[trail.length - 1];
  const entries = useMemo(() => catalogEntries(registry, scope), [registry, scope]);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastHeading = useRef({ screen, scope });
  const s = PRESET_STRINGS[locale];
  const push = (next: Screen) => setTrail(prev => [...prev, next]);
  const back = () => setTrail(prev => prev.slice(0, -1));
  const changeScope = (next: CatalogScope) => { setTrail([root]); setScope(next); };

  useEffect(() => {
    if (lastHeading.current.screen === screen && lastHeading.current.scope === scope) return;
    lastHeading.current = { screen, scope };
    heading.current?.focus();
  }, [screen, scope]);

  if (screen.kind === 'play') return <PresetPlayer {...screen} scope={scope} locale={guideLanguage} appLocale={locale}
    onFamily={onFamily ? () => onFamily({ source: 'preset', entry: screen.entry, guide: screen.guide, port: screen.port, locale: guideLanguage }) : undefined}
    onTasks={back} onRecheck={() => setTrail([root, { kind: 'models', brand: screen.entry.tv.brand }])} />;

  const selectedBrand = scope === 'device-verified' && screen.kind === 'models' ? tvBrands.find(b => b.name === screen.brand) : undefined;
  const titles = { brands: s.title, models: selectedBrand?.name ?? s.model, remotes: s.remote, tasks: s.chooseTask };
  const layouts = screen.kind === 'remotes' ? entries.filter(e => e.tv.id === screen.tv.id) : [];
  return <main className="flow preset-flow">
    <FlowHeading icon="library" title={titles[screen.kind]} headingRef={heading} description={screen.kind === 'brands' ? s.entry : undefined} />
    <div className="flow-panel stack">
      {scope === 'demo' && <span className="badge badge-demo">{s.demo}</span>}
      {scope === 'demo' && screen.kind === 'brands' && hdmiDemo(registry) && <a className="btn btn-secondary" href={`?flow=presets&demo=hdmi-2&lang=${locale}`}>{s.hdmiDemo}</a>}
      {selectedBrand && <ManufacturerGuides brand={selectedBrand} locale={locale} />}
      {selectedBrand && entries.some(e => e.tv.brand === selectedBrand.name) && <h2>{BRAND_COPY[locale].verified}</h2>}
      {(screen.kind === 'brands' || (screen.kind === 'models' && (!selectedBrand || entries.some(e => e.tv.brand === selectedBrand.name)))) &&
        <ModelBrowser key={`${scope}-${screen.kind}`} entries={entries} locale={locale} scope={scope}
          brand={screen.kind === 'models' ? screen.brand : undefined}
          onBrand={brand => push({ kind: 'models', brand })}
          onModel={(tv, task) => push({ kind: 'remotes', tv, task })} />}
      {screen.kind === 'remotes' && <>
        <p className="preset-context"><strong>{screen.tv.modelCode}</strong> · {tvVariant(screen.tv)}</p>
        <p className="muted">{s.remoteHint}</p>
        {layouts.length > 1 && <p className="warn-box">{s.variants}</p>}
        {layouts.map(entry => <LayoutCard key={entry.remote.id} entry={entry} locale={locale}
          samePart={layouts.some(other => other.remote.id !== entry.remote.id &&
            other.remote.partNumber.toLowerCase() === entry.remote.partNumber.toLowerCase())}
          onConfirm={() => push({ kind: 'tasks', entry, task: screen.task })} />)}
      </>}
      {screen.kind === 'tasks' && <TaskPicker entry={screen.entry} preferredTask={screen.task}
        locale={locale} language={guideLanguage} onLanguage={setGuideLanguage} onFamily={onFamily} onStart={(guide, port) => push({ kind: 'play', entry: screen.entry, guide, port })} />}
    </div>
    {screen.kind !== 'tasks' && <PhotoLink locale={locale} reason={screen.kind === 'remotes' ? s.noLayout : undefined} />}
    {selectedBrand && findBrand(brandId) ? <a className="btn btn-secondary" href={`?flow=presets&lang=${locale}`}>← {s.brand}</a> : screen.kind === 'brands' ?
      <button type="button" className="btn btn-secondary" onClick={() => changeScope(scope === 'demo' ? 'device-verified' : 'demo')}>
        {scope === 'demo' ? s.exitDemo : s.tryDemo}
      </button> :
      <button type="button" className="btn btn-secondary" onClick={back}>← {STRINGS[locale].back}</button>}
  </main>;
}

interface ModelMatch { tv: TvProfile; parts: Set<string>; tasks: Map<TaskGuide['task'], string> }

function ModelBrowser({ entries, locale, scope, brand, onBrand, onModel }: {
  entries: CatalogEntry[]; locale: Locale; scope: CatalogScope; brand?: string;
  onBrand: (brand: string) => void; onModel: (tv: TvProfile, task?: TaskGuide['task']) => void;
}) {
  const [query, setQuery] = useState('');
  const s = PRESET_STRINGS[locale];
  const words = query.trim().normalize().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (values: string[]) => {
    const text = values.join(' ').normalize().toLowerCase();
    return words.every(word => text.includes(word));
  };
  const models = new Map<string, ModelMatch>();
  for (const { tv, remote, guides } of entries) {
    if (brand && tv.brand !== brand) continue;
    const fields = [tv.brand, tv.modelCode, tvVariant(tv)];
    fields.push(remote.partNumber, ...guides.flatMap(g => [g.title.en, g.title.ml]));
    if (!matches(fields)) continue;
    const match: ModelMatch = models.get(tv.id) ?? { tv, parts: new Set(), tasks: new Map() };
    match.parts.add(remote.partNumber);
    for (const guide of guides) {
      if ((brand && !words.length) || (words.length && matches([guide.title.en, guide.title.ml]))) {
        match.tasks.set(guide.task, guide.title[authoredLocale(locale)]);
      }
    }
    models.set(tv.id, match);
  }
  const knownBrands = scope === 'device-verified' ? tvBrands : [];
  const verifiedCounts = new Map<string, number>();
  for (const { tv, guides } of entries) verifiedCounts.set(tv.brand, (verifiedCounts.get(tv.brand) ?? 0) + guides.length);
  const tiles = knownBrands.filter(b => b.guides.some(g => matches([
    b.name, g.model ?? '', BRAND_COPY[locale][g.title], BRAND_COPY.en[g.title],
    g.title === 'sound' ? 'mute unmute volume' : '',
  ])));
  const otherBrands = [...new Set(entries.map(e => e.tv.brand))]
    .filter(name => !knownBrands.some(b => b.name === name) && matches([name]));
  const showTiles = !brand && (tiles.length > 0 || otherBrands.length > 0);
  return <>
    {scope === 'demo' && !brand && <p className="muted">{s.demoNote}</p>}
    {brand && <p className="preset-context">{brand}</p>}
    {showTiles && <section className="stack" aria-labelledby="choose-brand">
      <h2 id="choose-brand">{s.brand}</h2>
      {tiles.length > 0 && <BrandTiles brands={tiles} locale={locale} verifiedCounts={verifiedCounts} />}
      {otherBrands.map(name => <button key={name} className="guide-link catalog-choice" type="button" onClick={() => onBrand(name)}>
        <strong>{name}</strong>
      </button>)}
    </section>}
    <label className="field">{brand ? s.modelSearch : s.search}
      <span className="search-field"><Icon name="search" /><input type="search" value={query}
        onChange={e => setQuery(e.target.value)} autoComplete="off" spellCheck={false} /></span>
    </label>
    {brand && <p className="muted">{s.modelHint} {s.menuHint}</p>}
    {(words.length > 0 || brand) && <div className="stack">
      {models.size === 0 && !showTiles && <p className="catalog-empty" role="status">{s.noResults}</p>}
      {[...models.values()].map(({ tv, parts, tasks }) => brand && scope === 'device-verified' && tasks.size ? (
        [...tasks].map(([task, title]) => <button key={tv.id + task} className="guide-link catalog-choice" type="button" onClick={() => onModel(tv, task)}>
          <strong>{title}</strong><span>{tv.modelCode} · {tvVariant(tv)}</span><span>{[...parts].join(' / ')}</span>
        </button>)
      ) : <button key={tv.id} className="guide-link catalog-choice" type="button"
        onClick={() => onModel(tv, tasks.size === 1 ? [...tasks.keys()][0] : undefined)}>
        <strong>{tv.modelCode}</strong><span>{tv.brand} · {tvVariant(tv)}</span><span>{[...parts].join(' / ')}</span>
        {tasks.size > 0 && <span>{[...tasks.values()].join(' · ')}</span>}
      </button>)}
      {!brand && models.size > 0 && <p className="muted">{s.modelHint} {s.menuHint}</p>}
    </div>}
    {!brand && <details className="label-help">
      <summary>{s.findLabels}</summary><p>{s.modelHint}</p><p>{s.remoteHint}</p>
    </details>}
  </>;
}

function LayoutCard({ entry, locale, samePart, onConfirm }: {
  entry: CatalogEntry; locale: Locale; samePart: boolean; onConfirm: () => void;
}) {
  const [image, setImage] = useState<'loading' | 'ready' | 'error'>('loading');
  const { remote } = entry;
  const s = PRESET_STRINGS[locale];
  return <section className="layout-card">
    <div className="layout-preview">
      {image === 'error' ? <p>{samePart ? s.layoutPhotoNeeded : s.imageMissing}</p> :
        <img src={remote.asset.src} alt={remote.asset.alt[authoredLocale(locale)]} width={remote.asset.width} height={remote.asset.height}
          onLoad={() => setImage('ready')} onError={() => setImage('error')} />}
    </div>
    <div className="layout-details">
      <h2>{remote.partNumber}</h2>
      <p id={`layout-${remote.id}`}>{remote.layoutVariant[authoredLocale(locale)]}</p>
      <button className="btn btn-primary" type="button" disabled={samePart && image !== 'ready'}
        aria-describedby={`layout-${remote.id}`} onClick={onConfirm}>
        {s.matches} · {remote.partNumber}
      </button>
    </div>
  </section>;
}

function TaskPicker({ entry, preferredTask, locale, language, onLanguage, onStart, onFamily }: {
  entry: CatalogEntry; preferredTask?: TaskGuide['task']; locale: Locale; language: AuthoredLocale; onLanguage: (l: AuthoredLocale) => void;
  onStart: (guide: TaskGuide, port: string | null) => void;
  onFamily?: Props['onFamily'];
}) {
  const [guideId, setGuideId] = useState(() => entry.guides.find(g => g.task === preferredTask)?.id ?? '');
  const [port, setPort] = useState<string | null>(null);
  const guide = entry.guides.find(g => g.id === guideId);
  const s = PRESET_STRINGS[locale];
  const ready = guide && stepsFor(guide, port);
  // Registry validation checks the steps, labels and narration for every authored locale.
  const authored = authoredLocales;
  return <form className="stack" onSubmit={e => { e.preventDefault(); if (guide && ready) onStart(guide, port); }}>
    <p className="preset-context">{entry.tv.modelCode} · {entry.remote.partNumber}</p>
    <div className="field">
      <label htmlFor="preset-task">{s.task}</label>
      <select id="preset-task" value={guideId} onChange={e => { setGuideId(e.target.value); setPort(null); }}>
        <option value="">{s.pickTask}</option>
        {entry.guides.map(g => <option key={g.id} value={g.id}>{g.title[language]}</option>)}
      </select>
    </div>
    {guide?.input.kind === 'hdmi-port' && <>
      <div className="field">
        <label htmlFor="preset-port">{s.port}</label>
        <select id="preset-port" value={port ?? ''} aria-describedby="port-hint" onChange={e => setPort(e.target.value || null)}>
          <option value="">{s.pickPort}</option>
          {Object.keys(guide.input.routes).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <p id="port-hint" className="muted">{s.portHint}</p>
    </>}
    <div className="field">
      <label htmlFor="preset-language">{s.language}</label>
      <select id="preset-language" aria-describedby={guide ? "preset-available" : undefined} value={language} onChange={e => onLanguage(e.target.value as AuthoredLocale)}>
        {authored.map(l => <option key={l} value={l} lang={l}>{languages[l].native}</option>)}
      </select>
    </div>
    {guide && <small id="preset-available">{s.available} · {authored.map(l => languages[l].native).join(' · ')}</small>}
    <button className="btn btn-primary" type="submit" disabled={!ready}>{s.start}</button>
    {onFamily && <button className="btn btn-secondary" type="button" disabled={!ready}
      onClick={() => guide && ready && onFamily({ source: 'preset', entry, guide, port, locale: language })}>{FAMILY[locale].create}</button>}
    <PhotoLink locale={locale} reason={guide?.task === 'switch_hdmi' ? s.missingPort : undefined} />
  </form>;
}
