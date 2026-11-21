import { useEffect, useState } from 'react';
import type { FamilySnapshot } from '../../shared/family';
import type { Locale } from '../data/types';
import { viewerMedia, viewerSnapshot } from './api';
import { FamilyPlayer } from './FamilyPlayer';
import { FAMILY } from './strings';
import { FlowHeading } from '../ui/Icon';

export function Viewer({ locale }: { locale: Locale }) {
  const [loaded, setLoaded] = useState<{ snapshot: FamilySnapshot; photo: Blob; token: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const reset = () => { setLoaded(null); setFailed(false); setGeneration(n => n + 1); };
    const restored = (e: PageTransitionEvent) => { if (e.persisted) reset(); };
    window.addEventListener('hashchange', reset); window.addEventListener('pageshow', restored);
    return () => { window.removeEventListener('hashchange', reset); window.removeEventListener('pageshow', restored); };
  }, []);
  useEffect(() => {
    const ctrl = new AbortController(), token = location.hash.slice(1);
    if (!/^[\w-]{43}$/.test(token)) { setFailed(true); return; }
    Promise.all([viewerSnapshot(token, ctrl.signal), viewerMedia(token, undefined, ctrl.signal)])
      .then(([snapshot, photo]) => { if (!ctrl.signal.aborted) { setLoaded({ snapshot, photo, token }); document.documentElement.lang = snapshot.locale; } })
      .catch(() => { if (!ctrl.signal.aborted) setFailed(true); });
    return () => ctrl.abort();
  }, [generation]);
  if (failed) return <main className="flow"><FlowHeading icon="lock" title={FAMILY[locale].unavailable} description={FAMILY[locale].badLink} /></main>;
  if (!loaded) return <main className="flow" role="status">{FAMILY[locale].wait}</main>;
  return <FamilyPlayer snapshot={loaded.snapshot} photo={loaded.photo} recheckAudio audio={async id => {
    try { return await viewerMedia(loaded.token, id); }
    catch (err) { if (err instanceof Error && err.message === 'family_404') setFailed(true); throw err; }
  }} />;
}
