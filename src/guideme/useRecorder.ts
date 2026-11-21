import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIA_LIMITS } from '../../shared/media';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'denied' | 'unsupported' | 'failed';

export const MAX_RECORDING_MS = MEDIA_LIMITS.recordingSeconds * 1000;

function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) ?? '';
}

/** Short voice request. Audio stays in memory and is handed to onAudio once; nothing is stored. */
export function useRecorder(onAudio: (blob: Blob) => void) {
  const [state, setState] = useState<RecorderState>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined' ? 'idle' : 'unsupported',
  );
  const [remaining, setRemaining] = useState(MAX_RECORDING_MS / 1000);
  const rec = useRef<MediaRecorder | null>(null);
  const mounted = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const timers = useRef<number[]>([]);
  const onAudioRef = useRef(onAudio);
  onAudioRef.current = onAudio;

  const cleanup = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'starting' || state === 'unsupported') return;
    setState('starting');
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired;
    } catch (err) {
      cleanup();
      setState(err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError') ? 'denied' : 'failed');
      return;
    }
    const mime = pickMime();
    const chunks: Blob[] = [];
    let r: MediaRecorder;
    try { r = new MediaRecorder(stream.current, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined); }
    catch { cleanup(); setState('failed'); return; }
    rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      cleanup();
      rec.current = null;
      setState('idle');
      const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
      if (blob.size > 0) onAudioRef.current(blob);
    };
    r.onerror = () => {
      r.onstop = null;
      if (r.state !== 'inactive') r.stop();
      rec.current = null;
      cleanup();
      setState('failed');
    };
    try { r.start(); } catch { rec.current = null; cleanup(); setState('failed'); return; }
    setState('recording');
    setRemaining(MAX_RECORDING_MS / 1000);
    const t0 = Date.now();
    const tick = () => {
      const left = Math.max(0, Math.ceil((MAX_RECORDING_MS - (Date.now() - t0)) / 1000));
      setRemaining(left);
      if (left > 0) timers.current.push(window.setTimeout(tick, 250));
    };
    tick();
    timers.current.push(window.setTimeout(() => stop(), MAX_RECORDING_MS));
  }, [state, stop]);

  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    if (rec.current && rec.current.state !== 'inactive') {
      rec.current.onstop = null;
      rec.current.stop();
    }
    cleanup();
  }; }, []);

  return { state, remaining, start, stop };
}
