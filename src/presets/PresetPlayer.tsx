import { isAuthoredLocale, languages, type AuthoredLocale } from '../../shared/languages';
import { useEffect, useRef, useState } from 'react';
import { presetText, stepsFor } from '../data/presets/catalog';
import { REGISTRY_VERSION, type CatalogEntry, type CatalogScope, type TaskGuide } from '../data/presets/types';
import type { Locale } from '../data/types';
import { getHealth, speakPresetUrl } from '../guideme/api';
import { FAMILY } from '../family/strings';
import { STRINGS } from '../i18n';
import { StepPlayer } from '../player/StepPlayer';
import { PRESET_STRINGS } from './strings';

interface Props {
  entry: CatalogEntry;
  guide: TaskGuide;
  scope: CatalogScope;
  port: string | null;
  locale: AuthoredLocale;
  appLocale?: Locale;
  onFamily?: () => void;
  onRecheck: () => void;
  onTasks: () => void;
}

export function PresetPlayer({ entry, guide, scope, port, locale, appLocale = locale, onFamily, onRecheck, onTasks }: Props) {
  const playerLocale = isAuthoredLocale(appLocale) ? locale : appLocale;
  const s = PRESET_STRINGS[playerLocale];
  const t = STRINGS[playerLocale];
  const { remote, tv } = entry;
  const [hasSpeech, setHasSpeech] = useState(false);
  const availability = useRef<ReturnType<typeof getHealth> | null>(null);
  useEffect(() => {
    let active = true;
    availability.current ??= getHealth();
    availability.current.then(health => { if (active) setHasSpeech(!!health?.speech && !health.demo); });
    return () => { active = false; };
  }, []);
  const steps = stepsFor(guide, port);
  if (!steps?.length) return <main className="flow"><p role="alert">{s.noResults}</p><PhotoLink locale={appLocale} /></main>;
  return <div lang={playerLocale}><StepPlayer
    title={presetText(guide.playTitle ?? guide.title, locale, port)}
    subtitle={[locale !== playerLocale && `${s.language} · ${languages[locale].native}`, tv.modelCode, remote.partNumber, guide.playTitle ? null : port].filter(Boolean).join(' · ')}
    subtitleInDetails={locale === playerLocale}
    badge={scope === 'demo' ? { tone: 'demo', text: s.demo, note: s.demoNote } :
      { tone: 'verified', text: t.verifiedBadge, note: guide.verifiedOn ?? undefined }}
    before={presetText(guide.startingState, locale, port)}
    steps={steps.map(step => {
      const control = remote.controls[step.controlId];
      const label = control.shortLabel ?? control.label;
      return {
        id: step.id, hotspot: control.hotspot, button: label[locale], photoLabel: label.en,
        buttonDescription: label[locale] !== control.label[locale] ? control.label[locale] : undefined,
        confirmation: step.confirmation && presetText(step.confirmation, locale, port),
        instruction: presetText(step.instruction, locale, port), expected: presetText(step.expected, locale, port),
        recovery: presetText(step.recovery, locale, port),
      };
    })}
    image={{ ...remote.asset, alt: remote.asset.alt[locale], frameWidth: 'min(68%, 260px)' }}
    locale={locale} contentLocale={locale} t={t}
    controls={Object.values(remote.controls).map(c => c.hotspot)}
    autoNarration={scope === 'device-verified' && hasSpeech}
    speak={hasSpeech ? step => speakPresetUrl(locale, { version: REGISTRY_VERSION, scope, guideId: guide.id, stepId: step.id, port }) : undefined}
    mismatchExtra={() => <>
      <button className="btn btn-secondary" type="button" onClick={onRecheck}>{s.recheck}</button>
      <PhotoLink locale={appLocale} />
    </>}
    footer={<><button className="btn btn-secondary wide" type="button" onClick={onTasks}>{s.otherTask}</button>
      {onFamily && <button lang={appLocale} className="btn btn-secondary wide" type="button" onClick={onFamily}>{FAMILY[appLocale].create}</button>}</>}
  /></div>;
}

export function PhotoLink({ locale, reason }: { locale: Locale; reason?: string }) {
  const text = PRESET_STRINGS[locale].photo;
  return <a className="btn btn-secondary photo-fallback" href={`?flow=remote&lang=${locale}`}>
    {reason ? `${reason} · ${text}` : text}
  </a>;
}
