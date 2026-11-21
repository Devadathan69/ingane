import { useState, type RefObject, type ReactNode } from 'react';
import { HDMI_COPY } from '../../shared/hdmi-copy';
import type { GuideLocale } from '../../shared/guide';
import { presetRegistry } from '../data/presets/registry';
import { catalogEntries } from '../data/presets/catalog';
import { FlowHeading } from '../ui/Icon';
import { STRINGS } from '../i18n';

export function InputList({ locale, uiLocale, question, choices, error, initialLabels, inputs, camera, gallery, useLabels, choose, back, headingRef }: {
  locale: GuideLocale; uiLocale: GuideLocale; question?: string; choices: string[]; error: string | null; initialLabels?: string[];
  inputs: ReactNode; camera: () => void; gallery: () => void; useLabels: (labels: string[]) => void; choose: (target: string) => void;
  back: () => void; headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const t = HDMI_COPY[locale];
  const [text, setText] = useState(initialLabels?.join('\n') ?? '');
  const labels = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const valid = labels.length > 0 && labels.length <= 30 && labels.every(l => l.length <= 60);
  const tested = catalogEntries(presetRegistry, 'device-verified').filter(e => e.guides.some(g => g.task === 'switch_hdmi'));
  return <main className="flow" lang={locale}>
    <FlowHeading icon="camera" headingRef={headingRef} title={choices.length ? t.target : t.listTitle} />
    {question && question !== t.listTitle && question !== t.target && <p role="status">{question}</p>}
    {error && <p className="error-box" role="alert">{error}</p>}
    {choices.length > 0 && <div className="stack">{choices.map(l =>
      <button className="btn btn-primary" key={l} onClick={() => choose(l)}><bdi>{l}</bdi></button>)}</div>}
    {inputs}
    <div className="stack">
      <button className="btn btn-secondary" onClick={camera}>{t.camera}</button>
      <button className="btn btn-secondary" onClick={gallery}>{t.gallery}</button>
    </div>
    <form className="field stack" onSubmit={e => { e.preventDefault(); if (valid) useLabels(labels); }}>
      <label>{t.typeLabels}<textarea rows={3} maxLength={1830} value={text} onChange={e => setText(e.target.value)} /></label>
      <button className="btn btn-secondary" disabled={!valid}>{t.sendLabels}</button>
    </form>
    <details><summary>{t.models}</summary>{tested.length
      ? tested.map(({ tv, remote }) => <a className="btn btn-secondary" key={tv.id + '/' + remote.id}
          href={'?flow=presets&' + new URLSearchParams({ lang: uiLocale, brand: tv.brand.toLowerCase() })}>
          {tv.brand} {tv.modelCode} · {remote.partNumber} · {tv.menuVariant}</a>)
      : <p>{t.noModels}</p>}</details>
    <button className="btn btn-secondary" onClick={back}>{STRINGS[uiLocale].back}</button>
  </main>;
}
