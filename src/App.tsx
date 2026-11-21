import { lazy, Suspense, useEffect, useState } from 'react';
import { GUIDES, DEVICES, LOCALES, lookupGuide, type Locale } from './data';
import { STRINGS } from './i18n';
import { GuideMe } from './guideme/GuideMe';
import { Player } from './player/Player';
import { Library } from './presets/Library';
import { GuidePicker } from './home/GuidePicker';
import { FlowHeading } from './ui/Icon';
import { FAMILY } from './family/strings';
import type { FamilySeed } from './family/draft';

const FamilyGuides = lazy(() => import('./family/FamilyGuides').then(m => ({ default: m.FamilyGuides })));
const FamilyViewer = lazy(() => import('./family/Viewer').then(m => ({ default: m.Viewer })));

const LANG_KEY = 'ingane.lang';

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { guide: p.get('guide'), lang: p.get('lang'), flow: p.get('flow') };
}

function initialLocale(): Locale {
  const fromUrl = readParams().lang;
  if (fromUrl && (LOCALES as string[]).includes(fromUrl)) return fromUrl as Locale;
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved && (LOCALES as string[]).includes(saved)) return saved as Locale;
  } catch {
    /* storage unavailable: fall through to default */
  }
  return 'ml';
}

export function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [guideId, setGuideId] = useState(() => readParams().guide);
  const [flow, setFlow] = useState(() => readParams().flow);
  const t = STRINGS[locale];
  const [seed, setSeed] = useState<FamilySeed | null>(null);
  const createFamily = (source: FamilySeed) => {
    setSeed(source); setGuideId(null); setFlow('family');
    window.history.pushState(null, '', `?flow=family&lang=${locale}`);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${STRINGS[locale].appName} · ${locale === 'ml' ? 'Ingane' : 'ഇങ്ങനെ'}`;
  }, [locale]);

  useEffect(() => {
    const onPop = () => {
      setGuideId(readParams().guide);
      setFlow(readParams().flow);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const changeLocale = (next: Locale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', next);
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore */
    }
  };

  const result = lookupGuide(guideId);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={`?lang=${locale}`} lang="ml">
          <img className="brand-symbol" src="ingane.svg" width="40" height="40" alt="" />
          <span className="brand-word">ഇങ്ങനെ</span><span className="brand-latin" lang="en">Ingane</span>
        </a>
        {flow !== 'family-view' && <button
          type="button"
          className="lang-toggle"
          lang={t.switchToLang}
          onClick={() => changeLocale(t.switchToLang)}
        >
          {t.switchTo}
        </button>}
      </header>

      {flow === 'family-view' ? (
        <Suspense fallback={<p role="status">{FAMILY[locale].wait}</p>}><FamilyViewer locale={locale} /></Suspense>
      ) : flow === 'remote' && !guideId ? (
        <GuideMe locale={locale} onLocale={changeLocale} onFamily={createFamily} />
      ) : flow === 'presets' && !guideId ? (
        <Library locale={locale} onLocale={changeLocale} onFamily={createFamily}
          demoHdmi2={new URLSearchParams(window.location.search).get('demo') === 'hdmi-2'} />
      ) : flow === 'family' && !guideId ? (
        <Suspense fallback={<p role="status">{FAMILY[locale].wait}</p>}><FamilyGuides locale={locale} seed={seed} /></Suspense>
      ) : result.ok ? (
        <Player key={result.guide.id} guide={result.guide} device={result.device} locale={locale} t={t} />
      ) : result.reason === 'missing' ? (
        <GuidePicker locale={locale}><GuideList locale={locale} /></GuidePicker>
      ) : (
        <main className="flow message">
          {result.reason === 'unknown' ? (
            <div role="alert">
              <FlowHeading icon="library" title={t.unknownTitle} description={t.unknownBody(result.id ?? '')} />
            </div>
          ) : (
            <div role="alert">
              <FlowHeading icon="library" title={t.invalidTitle} description={t.invalidBody} />
              {import.meta.env.DEV && (
                <ul className="dev-errors">
                  {result.errors?.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
          <GuideList locale={locale} />
        </main>
      )}
      <footer className="photo-credit"><a href="./photo-credit.txt" referrerPolicy="no-referrer">{locale === 'ml' ? 'പരിശീലന ഫോട്ടോയുടെ കടപ്പാട്' : 'Practice photo credit'}</a></footer>
    </div>
  );
}

function GuideList({ locale }: { locale: Locale }) {
  return (
    <ul className="guide-list">
      {Object.values(GUIDES).map((g) => (
        <li key={g.id}>
          <a className="guide-link" href={`?guide=${encodeURIComponent(g.id)}&lang=${locale}`}>
            <span className="guide-link-title">{g.title[locale]}</span>
            <span className="guide-link-device">{DEVICES[g.deviceId]?.name[locale]}</span>
            {g.verification !== 'verified' && (
              <span className="guide-link-badge">{STRINGS[locale].sampleBadge}</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
