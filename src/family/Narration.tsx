import { useEffect, useRef, useState } from 'react';
import { FAMILY_LIMITS, containsContact, containsCredential, type FamilyStep } from '../../shared/family';
import type { Locale } from '../data/types';
import { useRecorder } from '../guideme/useRecorder';
import { sarvamClip } from './api';
import { useBlobUrl } from './FamilyPlayer';
import { FAMILY } from './strings';

/** A single metadata-free format gives the server an independently measurable duration. */
export async function familyWav(input: Blob): Promise<Blob> {
  if (!input.size || input.size > FAMILY_LIMITS.audioBytes || !/^audio\/(webm|ogg|mp4|wav|x-wav)(;|$)/i.test(input.type)) throw new Error('audio_type');
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await input.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > FAMILY_LIMITS.seconds + 0.5) throw new Error('audio_length');
    const rate = 16_000, count = Math.ceil(Math.min(FAMILY_LIMITS.seconds, decoded.duration) * rate);
    const offline = new OfflineAudioContext(1, count, rate), source = offline.createBufferSource();
    source.buffer = decoded; source.connect(offline.destination); source.start();
    const mono = (await offline.startRendering()).getChannelData(0);
    const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
    const tag = (n: number, v: string) => [...v].forEach((c, i) => view.setUint8(n + i, c.charCodeAt(0)));
    tag(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); tag(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, mono[i])) * 32767), true);
    return new Blob([buffer], { type: 'audio/wav' });
  } finally { await context.close(); }
}

export function Narration({ step, locale, language, clip, accessKey, live, onClip }: {
  step: FamilyStep; locale: Locale; language: Locale; clip?: Blob; accessKey: string; live: boolean;
  onClip: (blob: Blob | null) => void;
}) {
  const s = FAMILY[locale], [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const active = useRef(true), player = useRef<HTMLAudioElement>(null);
  const matching = step.audioLocale === language;
  const url = useBlobUrl(matching ? clip : null);
  const text = step.instruction.includes(step.screenLabel) ? step.instruction : step.instruction + '. ' + step.screenLabel;
  const latestText = useRef(text);
  latestText.current = text;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { const el = player.current; return () => { el?.pause(); }; }, [url]);
  const accept = async (input: Promise<Blob>, generatedText?: string) => {
    setBusy(true); setError(false);
    try {
      const wav = await familyWav(await input);
      if (active.current && (generatedText === undefined || latestText.current === generatedText)) onClip(wav);
    }
    catch { if (active.current) setError(true); } finally { if (active.current) setBusy(false); }
  };
  const rec = useRecorder(b => void accept(Promise.resolve(b)));
  return <section className="stack narration-panel"><h2>{s.audio}</h2>
    <button className="btn btn-secondary" type="button" disabled={busy || rec.state === 'starting' || rec.state === 'unsupported'}
      onClick={() => { if (rec.state === 'recording') rec.stop(); else { player.current?.pause(); void rec.start(); } }}>
      {rec.state === 'recording' ? s.stop + ' · ' + rec.remaining + ' s' : (clip ? s.replaceAudio : s.record) + ' · 15 s'}
    </button>
    {(rec.state === 'denied' || rec.state === 'unsupported' || rec.state === 'failed') && <p className="muted" role="status">{s.noMic}</p>}
    {url && <audio ref={player} key={url} controls preload="none" src={url} aria-label={s.replay} />}
    {clip && <>{!matching && <p>{s.otherVoice}</p>}<button className="btn btn-secondary" type="button"
      disabled={busy || rec.state === 'recording'} onClick={() => onClip(null)}>{s.removeAudio}</button></>}
    <button type="button" className="btn btn-secondary" disabled={busy || rec.state === 'recording' || !live || !accessKey || !step.instruction.trim() || containsCredential(text) || containsContact(text)}
      onClick={() => void accept(sarvamClip(accessKey, language, text), text)}>{s.sarvam}</button>
    <p className="muted">{!live ? s.noSarvam : accessKey ? s.speechText : s.speechSignIn}</p>
    {busy && <p role="status">{s.busy}</p>}{error && <p className="warn-box" role="alert">{s.clipFailed}</p>}
  </section>;
}
