import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FamilySnapshot } from '../../shared/family';
import { STRINGS } from '../i18n';
import { StepPlayer } from '../player/StepPlayer';
import { FAMILY } from './strings';

export function useBlobUrl(blob: Blob | null | undefined) {
  const [resource, setResource] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setResource({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return resource?.blob === blob ? resource?.url : undefined;
}

export function FamilyPlayer({ snapshot, photo, audio, footer, recheckAudio }: {
  snapshot: FamilySnapshot; photo: Blob; audio: (id: string) => Promise<Blob>; footer?: ReactNode; recheckAudio?: boolean;
}) {
  const url = useBlobUrl(photo);
  const clips = useRef(new Map<string, string>());
  const disposed = useRef(false);
  useEffect(() => {
    disposed.current = false;
    const urls = clips.current;
    return () => { disposed.current = true; urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); };
  }, []);
  const getClip = async (id: string) => {
    const existing = clips.current.get(id);
    if (existing && !recheckAudio) return existing;
    const blob = await audio(id);
    if (disposed.current) throw new Error('closed');
    const current = clips.current.get(id);
    if (current) return current;
    const src = URL.createObjectURL(blob);
    clips.current.set(id, src);
    return src;
  };
  const { locale } = snapshot;
  const s = FAMILY[locale];
  if (!url) return <p role="status">{s.wait}</p>;
  return <div lang={locale}><StepPlayer title={snapshot.title} subtitle={snapshot.nickname}
    badge={snapshot.demo ? { tone: 'demo', text: s.demo } : undefined} before={snapshot.before}
    steps={snapshot.steps.map(step => ({ ...step, hotspot: step.hotspot ?? undefined, button: step.button ?? undefined,
      loadAudio: step.hasAudio ? () => getClip(step.id) : undefined }))}
    image={{ src: url, ...snapshot.image, alt: s.remote, frameWidth: 'min(78%, 300px)' }}
    locale={locale} t={{ ...STRINGS[locale], restart: s.restart, no: s.screenNo, doneTitle: locale === 'en' ? 'Done' : STRINGS.ml.doneTitle }}
    footer={footer} /></div>;
}
