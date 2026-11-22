import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type AudioState = 'idle' | 'loading' | 'playing' | 'played' | 'blocked' | 'failed';
const MUTE_KEY = 'ingane.guide-narration.muted';

function mutedOnThisDevice(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function useStepNarration({ stepKey, resetKey, active, auto, url, load }: {
  stepKey: string;
  resetKey: string;
  active: boolean;
  auto: boolean;
  url?: string;
  load?: () => Promise<string>;
}) {
  const [muted, setMuted] = useState(mutedOnThisDevice);
  const mutedRef = useRef(muted);
  const [state, setState] = useState<AudioState>('idle');
  const playing = useRef<HTMLAudioElement | null>(null);
  const reusable = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const current = useRef({ active, auto, url, load });
  const cache = useRef(new Map<string, { pending: Promise<string>; ready?: string }>());

  useLayoutEffect(() => {
    current.current = { active, auto, url, load };
  });

  const stop = useCallback(() => {
    generation.current += 1;
    const a = playing.current;
    playing.current = null;
    if (a) {
      a.onended = null;
      a.onerror = null;
      a.pause();
    }
  }, []);

  const start = useCallback((key: string) => {
    const source = current.current;
    if (!source.active || (!source.url && !source.load)) return;
    stop();
    setState('loading');
    const request = generation.current;
    const update = (value: AudioState) => {
      if (request === generation.current) setState(value);
    };
    const rejected = (error: unknown) => update((error as { name?: string } | null)?.name === 'NotAllowedError' ? 'blocked' : 'failed');
    const playUrl = (clip: string) => {
      if (request !== generation.current) return;
      if (!clip) { update('failed'); return; }
      try {
        const a = source.auto ? (reusable.current ??= new Audio(clip)) : new Audio(clip);
        if (source.auto && a.src !== clip) a.src = clip;
        if (source.auto && a.currentTime > 0) a.currentTime = 0;
        playing.current = a;
        let ended = false;
        a.onended = () => { ended = true; update('played'); };
        a.onerror = () => { ended = true; update('failed'); };
        // When the audio URL is already available, call play in the tap handler's
        // own stack so restrictive browsers see the user's activation.
        void Promise.resolve(a.play()).then(() => {
          if (!ended) update('playing');
        }, rejected);
      } catch (error) {
        rejected(error);
      }
    };
    if (source.url) { playUrl(source.url); return; }
    if (!source.auto) {
      try { void source.load!().then(playUrl, rejected); } catch (error) { rejected(error); }
      return;
    }
    let entry = cache.current.get(key);
    if (entry?.ready) { playUrl(entry.ready); return; }
    if (!entry) {
      try { entry = { pending: source.load!() }; } catch (error) { rejected(error); return; }
      const stored = entry;
      cache.current.set(key, stored);
      // Keep the latest few clips for same-gesture retry, replay and Back.
      if (cache.current.size > 24) cache.current.delete(cache.current.keys().next().value!);
      void stored.pending.then(clip => { stored.ready = clip; }, () => {
        if (cache.current.get(key) === stored) cache.current.delete(key);
      });
    }
    void entry.pending.then(playUrl, rejected);
  }, [stop]);

  // Invalidate old promises immediately when the step or gate changes,
  // before the new step can receive a tap or display stale audio state.
  useLayoutEffect(() => {
    stop();
    setState('idle');
    return stop;
  }, [stepKey, resetKey, active, auto, stop]);

  useEffect(() => {
    if (active && auto && !mutedRef.current) start(stepKey);
    // Mute toggles start/stop directly below, inside the user gesture.
  }, [stepKey, resetKey, active, auto, start]);

  const toggleMute = () => {
    const next = !muted;
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* unavailable storage */ }
    mutedRef.current = next;
    setMuted(next);
    if (next) { stop(); setState('idle'); }
    else start(stepKey);
  };

  return { state, muted, toggleMute, play: () => start(stepKey), stop };
}
