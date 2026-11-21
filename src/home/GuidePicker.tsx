import { tvBrands } from '../data/brand-guides';
import { BrandTiles } from '../presets/BrandTiles';
import { PRESET_STRINGS } from '../presets/strings';
import { useRef } from 'react';
import type { Locale } from '../data';
import { hdmiDemo } from '../data/presets/catalog';
import { presetRegistry } from '../data/presets/registry';
import { PhotoInputs } from '../guideme/PhotoInputs';
import { STRINGS } from '../i18n';
import { Icon } from '../ui/Icon';
import './guide-picker.css';

const practice = hdmiDemo(presetRegistry);

function RemoteExample({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  return <figure className="home-example">
    <div className="example-art" aria-hidden="true">
      <div className="example-orbit" /><div className="example-frame" />
      <div className="example-remote">
        <span className="example-power">⏻</span><i className="example-shortcut" />
        <div className="example-pad"><i /><b /><b /><b /><b /></div>
        <div className="example-rockers"><span>+<br />−</span><span><i /><i /></span></div>
      </div>
      <div className="example-leader" /><i className="example-dot" />
    </div>
    <figcaption className="example-copy"><span>{t.exampleQuestion}</span><strong>{t.exampleAnswer}</strong><small>{t.exampleCaption}</small></figcaption>
  </figure>;
}

export function GuidePicker({ locale, onPhoto }: { locale: Locale; onPhoto: (file: File) => void }) {
  const t = STRINGS[locale];
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null);
  return <main className="picker" aria-labelledby="picker-title">
    <section className="photo-home" aria-labelledby="picker-title">
      <header className="home-intro">
        <p className="home-kicker">{t.tvHelp}</p>
        <h1 id="picker-title">{t.chooseTitle}</h1>
        <p className="home-hint">{t.homeHint}</p>
      </header>
      <RemoteExample locale={locale} />
      <div className="capture-actions">
        <PhotoInputs camRef={camera} galRef={gallery} onFile={onPhoto} />
        <button type="button" className="btn btn-primary capture-primary" aria-describedby="home-photo-privacy" onClick={() => camera.current?.click()}><Icon name="camera" /><span>{t.takeRemote}</span><Icon name="arrow" /></button>
        <button type="button" className="btn capture-gallery" onClick={() => gallery.current?.click()}><Icon name="gallery" /><span>{t.choosePhoto}</span></button>
        <p className="sr-only" id="home-photo-privacy">{t.localPhoto}</p>
      </div>
    </section>
    <nav className="picker-nav" aria-labelledby="other-guides">
      <h2 id="other-guides">{t.otherGuides}</h2>
      <a className="route-card" href={`?flow=presets&lang=${locale}`}><span className="icon-tile"><Icon name="guide" /></span><strong>{t.browse}</strong><Icon name="arrow" /></a>
      <a className="route-card" href={`?flow=family&lang=${locale}`}><span className="icon-tile"><Icon name="family" /></span><strong>{t.createForSomeone}</strong><Icon name="arrow" /></a>
    </nav>
    <section className="picker-brands" aria-labelledby="home-brands">
      <h2 id="home-brands">{PRESET_STRINGS[locale].brand}</h2>
      <BrandTiles compact brands={tvBrands} locale={locale} />
    </section>
    {practice && <a className="practice-link" href={`?flow=presets&demo=hdmi-2&lang=${locale}`}>{t.tryDemo}</a>}
  </main>;
}
