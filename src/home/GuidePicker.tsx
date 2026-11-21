import { useState, type ReactNode } from 'react';
import type { Locale } from '../data';
import { hdmiDemo } from '../data/presets/catalog';
import { presetRegistry } from '../data/presets/registry';
import { FAMILY } from '../family/strings';
import { STRINGS } from '../i18n';
import { hotspotStyle, PressHand } from '../player/PressCue';
import { PRESET_STRINGS } from '../presets/strings';
import { Icon } from '../ui/Icon';
import { ButtonCallout, StageBackdrop } from '../ui/PhotoStage';
import './guide-picker.css';

const practice = hdmiDemo(presetRegistry);

function CoverPhoto({ demo }: { demo: NonNullable<typeof practice> }) {
  const { asset } = demo.entry.remote;
  const box = demo.control.hotspot;
  const [photo, setPhoto] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  if (photo === 'unavailable') return null;
  return <div className="cover-art" aria-hidden="true" data-photo-stage>
    <StageBackdrop />
    <div className="cover-photo" style={{ aspectRatio: asset.width + ' / ' + asset.height }}>
      <img className="practice-cutout" src={asset.src} width={asset.width} height={asset.height} alt="" fetchPriority="high"
        onLoad={e => setPhoto(e.currentTarget.naturalWidth === asset.width && e.currentTarget.naturalHeight === asset.height ? 'ready' : 'unavailable')}
        onError={() => setPhoto('unavailable')} />
      {photo === 'ready' && <>
        <span className="cover-ring" style={hotspotStyle(box)} />
        <ButtonCallout box={box} label={(demo.control.shortLabel ?? demo.control.label).en} />
        <span className="cover-tip" style={{ left: (box.x + box.w / 2) * 100 + '%', top: (box.y + box.h / 2) * 100 + '%' }}>
          <PressHand />
        </span>
      </>}
    </div>
  </div>;
}

export function GuidePicker({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = STRINGS[locale], presets = PRESET_STRINGS[locale];
  const destinations = [
    { flow: 'presets', icon: 'library', title: presets.title, description: presets.entry },
    { flow: 'remote', icon: 'camera', title: t.guideMe, description: t.guideMeBody },
    { flow: 'family', icon: 'family', title: FAMILY[locale].hub, description: t.familyIntro },
  ] as const;
  return <main className="picker" aria-labelledby="picker-title">
    <header className="picker-heading"><h1 id="picker-title">{t.chooseTitle}</h1><p>{t.tagline}</p></header>
    {practice && <section className="demo-cover" aria-labelledby="demo-title">
      <CoverPhoto demo={practice} />
      <div className="cover-copy">
        <span className="cover-badge">{t.interactiveDemo}</span>
        <h2 id="demo-title">{t.demoTitle}</h2>
        <p>{t.demoIntro}</p>
        <a className="btn btn-primary cover-start" href={`?flow=presets&demo=hdmi-2&lang=${locale}`}>
          {presets.hdmiDemo}<Icon name="arrow" />
        </a>
      </div>
    </section>}
    <nav className="picker-nav" aria-labelledby="other-guides">
      <h2 id="other-guides">{t.otherGuides}</h2>
      <div className="route-list">{destinations.map(item => <a key={item.flow} className="route-card" href={`?flow=${item.flow}&lang=${locale}`}>
        <span className="icon-tile"><Icon name={item.icon} /></span>
        <span className="route-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
        <Icon name="open" />
      </a>)}</div>
    </nav>
    <details className="older-guides"><summary>{presets.older}</summary>{children}</details>
  </main>;
}
