import { useEffect, useRef, useState } from 'react';
import { audioReady, FAMILY_LIMITS, containsContact, containsCredential, type FamilyStep } from '../../shared/family';
import type { GuideLanguage } from '../../shared/languages';
import type { Locale } from '../data/types';
import { useRecorder } from '../guideme/useRecorder';
import { sarvamClip } from './api';
import { useBlobUrl } from './FamilyPlayer';
import { FAMILY } from './strings';
import type { FamilyDraft } from './draft';

function spokenText(step: FamilyStep) {
  return step.instruction.includes(step.screenLabel) ? step.instruction : step.instruction + '. ' + step.screenLabel;
}

export function GuideNarration({ draft, locale, accessKey, onClip, setWorking }: {
  draft: FamilyDraft; locale: Locale; accessKey: string; onClip: (step: FamilyStep, audio: Blob) => void; setWorking: (busy: boolean) => void;
}) {
  const s = FAMILY[locale], { steps, locale: language } = draft.guide;
  const [progress,setProgress] = useState(''), [failed,setFailed] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => { running.current?.abort(); setWorking(false); }, [setWorking]);
  const missing = steps.filter(step => !draft.clips[step.id] && step.instruction.trim() &&
    !containsContact(spokenText(step)) && !containsCredential(spokenText(step)));
  const complete = steps.length > 0 && steps.every(step => draft.clips[step.id] && audioReady(step,language));
  const generate = async () => {
    if (running.current) return;
    const ctrl = new AbortController();
    running.current = ctrl; setFailed(false); setWorking(true);
    try {
      for (const [index,step] of missing.entries()) {
        setProgress((index + 1) + ' / ' + missing.length);
        try {
          const wav = await familyWav(await sarvamClip(accessKey, language, spokenText(step), ctrl.signal));
          if (ctrl.signal.aborted) break;
          onClip(step,wav);
        } catch {
          if (ctrl.signal.aborted) break;
          setFailed(true);
        }
      }
    } finally { running.current = null; if (!ctrl.signal.aborted) { setProgress(''); setWorking(false); } }
  };
  return <section className="stack" aria-label={s.narrateAll}>
    {complete ? <p role="status">{s.allVoiced}</p> : <>
      <p className="muted">{s.narrateHelp}</p>
      <button type="button" className="btn btn-secondary" disabled={!!progress || !missing.length} onClick={() => void generate()}>{s.narrateAll}</button>
    </>}
    {progress && <p role="status">{s.audioProgress} · {progress}</p>}{failed && <p className="warn-box" role="status">{s.audioPartial}</p>}
  </section>;
}

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
  step: FamilyStep; locale: Locale; language: GuideLanguage; clip?: Blob; accessKey: string; live: boolean;
  onClip: (blob: Blob | null) => void;
}) {
  const s = FAMILY[locale], [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const generation = useRef<AbortController | null>(null);
  const active = useRef(true), player = useRef<HTMLAudioElement>(null);
  const matching = audioReady(step, language);
  const [listened, setListened] = useState(false);
  const url = useBlobUrl(clip);
  const text = spokenText(step);
  useEffect(() => setListened(false), [url]);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current?.abort(); }; }, []);
  useEffect(() => { const el = player.current; return () => { el?.pause(); }; }, [url]);
  const accept = async (input: Promise<Blob>) => {
    setBusy(true); setError(false);
    try {
      const audio = await input;
      if (!active.current) return;
      const wav = await familyWav(audio);
      if (active.current) onClip(wav);
    }
    catch { if (active.current) setError(true); } finally { if (active.current) setBusy(false); }
  };
  const rec = useRecorder(b => void accept(Promise.resolve(b)));
  return <section className="stack narration-panel"><p className="muted">{s.audioEditHint}</p>
    <button className="btn btn-secondary" type="button" disabled={busy || rec.state === 'starting' || rec.state === 'unsupported'}
      onClick={() => { if (rec.state === 'recording') rec.stop(); else { player.current?.pause(); void rec.start(); } }}>
      {rec.state === 'recording' ? s.stop + ' · ' + rec.remaining + ' s' : (clip ? s.replaceAudio : s.record) + ' · 15 s'}
    </button>
    {(rec.state === 'denied' || rec.state === 'unsupported' || rec.state === 'failed') && <p className="muted" role="status">{s.noMic}</p>}
    {url && <audio ref={player} key={url} controls preload="none" onEnded={e => {
      const audio = e.currentTarget, played = audio.played;
      setListened(played.length === 1 && played.start(0) < .15 && played.end(0) >= audio.duration - .15);
    }} src={url} aria-label={s.replay} />}
    {clip && <>{!matching && <><p role="status">{s.stale}</p>
      <button type="button" className="btn btn-secondary" disabled={!listened || busy || rec.state === 'recording' || rec.state === 'starting'}
        onClick={() => onClip(clip)}>{s.approve}</button></>}<button className="btn btn-secondary" type="button"
      disabled={busy || rec.state === 'recording' || rec.state === 'starting'} onClick={() => onClip(null)}>{s.removeAudio}</button></>}
    <button type="button" className="btn btn-secondary" disabled={busy || rec.state === 'recording' || rec.state === 'starting' || !live || !accessKey || !step.instruction.trim() || containsCredential(text) || containsContact(text)}
      onClick={() => { generation.current = new AbortController(); void accept(sarvamClip(accessKey, language, text, generation.current.signal)); }}>{s.sarvam}</button>
    <p className="muted">{!live ? s.noSarvam : accessKey ? s.speechText : s.speechSignIn}</p>
    {busy && <p role="status">{s.busy}</p>}{error && <p className="warn-box" role="alert">{s.clipFailed}</p>}
  </section>;
}
