import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import type { Hotspot } from '../data';
import { hotspotStyle, isPressTarget, PressCue } from './PressCue';
import { ButtonCallout, StageBackdrop } from '../ui/PhotoStage';
export { hotspotStyle } from './PressCue';

const preference = '(prefers-reduced-motion: reduce)';
const reduced = () => window.matchMedia?.(preference).matches ?? true;
function watchMotion(change: () => void) {
  const query = window.matchMedia?.(preference);
  query?.addEventListener('change', change);
  return () => query?.removeEventListener('change', change);
}
export const useReducedMotion = () => useSyncExternalStore(watchMotion, reduced, () => true);

interface Props {
  src: string;
  width: number;
  height: number;
  alt: string;
  hotspot?: Hotspot;
  scrollStepId?: string;
  failedText: string;
  hint: string;
  /** CSS width of the image frame. V1 remotes are narrow (260px cap); user photos use the full width. */
  frameWidth?: string;
  /** When set, tapping the photo reports a normalized point (tap-to-mark). */
  onTap?: (pt: { x: number; y: number }) => void;
  /** Visual style of the outline. */
  ringStyle?: 'guide' | 'mark';
  stage?: {
    stepId: string; paused: boolean; introduced: RefObject<boolean>; neighbours: Hotspot[];
    label: string; button?: string; callout?: string; full: string; detail: string;
    replay: number; reduce: boolean; viewport: RefObject<HTMLDivElement | null>; onTarget: (available: boolean) => void;
  };
}

export function RemoteImage({ src, width, height, alt, hotspot, scrollStepId, failedText, hint, frameWidth = 'min(100%, 260px)', onTap, ringStyle = 'guide', stage }: Props) {
  const localViewport = useRef<HTMLDivElement>(null);
  const viewport = stage?.viewport ?? localViewport;
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [settled, setSettled] = useState(false);
  const [view, setView] = useState<'full' | 'detail' | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reduce = stage?.reduce ?? true;
  const replay = stage?.replay ?? 0;
  const introduced = stage?.introduced;
  const openingStep = useRef(stage?.stepId);
  const interrupted = stage?.stepId !== openingStep.current || stage?.paused || replay > 0 || view !== null;
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!introduced || !el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setSize(prev => prev.w === w && prev.h === h ? prev : { w, h });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [introduced, viewport]);

  useLayoutEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth > 0) setStatus('loaded');
  }, []);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!introduced || !el || status !== 'loaded') return;
    if (introduced.current || reduce || interrupted || !el.animate) {
      introduced.current = true; setSettled(true); return;
    }
    const vp = viewport.current!;
    if (!el.clientWidth || vp.clientWidth <= 32 || vp.clientHeight <= 16) {
      introduced.current = true; setSettled(true); return;
    }
    const fit = Math.min((vp.clientWidth - 32) / width, (vp.clientHeight - 16) / height);
    const scale = width * fit / el.getBoundingClientRect().width;
    const revealingDetail = scale < .95;
    const dx = (vp.clientWidth - width * fit) / 2 - el.offsetLeft;
    const dy = (vp.clientHeight - height * fit) / 2 - el.offsetTop;
    const overview = revealingDetail ? `translate(${dx}px,${dy}px) scale(${scale})` : '';
    const ease = 'cubic-bezier(.18,.78,.24,1)';
    const lift = el.animate([
      { transform: overview + ' translateY(22px) rotateX(8deg) rotateZ(-2deg) scale(.97)', opacity: .38, easing: ease,
        filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 15%))' },
      ...(revealingDetail ? [
        { offset: .45, transform: overview, opacity: 1 },
        { offset: .57, transform: overview, opacity: 1, easing: ease },
      ] : []),
      { transform: 'none', opacity: 1, filter: 'drop-shadow(0 9px 9px rgb(0 0 0 / 32%))' },
    ], { duration: revealingDetail ? 820 : 540 });
    lift.onfinish = () => { introduced.current = true; setSettled(true); };
    return () => { lift.onfinish = null; lift.cancel(); };
  }, [introduced, status, reduce, interrupted, width, height, viewport]);

  useLayoutEffect(() => {
    const vp = viewport.current;
    const el = img.current;
    if (introduced || !vp || !el || status !== 'loaded' || !hotspot) return;
    const centre = el.offsetTop + el.offsetHeight * (hotspot.y + hotspot.h / 2);
    vp.scrollTop = Math.max(0, centre - vp.clientHeight / 2);
  }, [hotspot, scrollStepId, status, src, introduced, viewport]);

  const usable = isPressTarget(hotspot) && status === 'loaded' && img.current?.naturalWidth === width && img.current?.naturalHeight === height;
  const onTarget = stage?.onTarget;
  useLayoutEffect(() => { onTarget?.(usable); }, [onTarget, usable]);

  if (status === 'error') {
    return (
      <p className="image-failed" role="note">
        {failedText}
      </p>
    );
  }

  const tap = (e: MouseEvent<HTMLImageElement>) => {
    if (!onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    onTap({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  const fit = Math.min((size.w - 32) / width, (size.h - 16) / height);
  const practicePhoto = !!stage && src === 'devices/coolux-practice.jpg';
  const detail = usable && size.w > 0 && (view ? view === 'detail' : !practicePhoto && height > width * 1.6 && width * fit < 110);
  let frameStyle: CSSProperties = stage ? { '--photo-ratio': width / height } as CSSProperties : { width: frameWidth };
  if (detail) {
    // Crop only the viewport. The photo and overlays keep one undistorted pixel grid.
    const w = width * fit * 1.85, h = height * fit * 1.85;
    const offset = (extent: number, available: number, centre: number) => extent <= available
      ? (available - extent) / 2 : Math.max(available - extent, Math.min(0, available / 2 - centre * extent));
    frameStyle = { position: 'absolute', width: w, left: offset(w, size.w, hotspot.x + hotspot.w / 2),
      top: offset(h, size.h, hotspot.y + hotspot.h / 2) };
  }
  return (
    <figure className={stage ? 'remote remote-stage' + (practicePhoto ? ' practice-stage' : '') : 'remote'}>
      <div className="remote-viewport" ref={viewport} data-photo-stage={stage ? true : undefined} role={stage ? 'group' : undefined} tabIndex={stage ? -1 : 0}
        aria-label={stage ? [stage.label, stage.button].filter(Boolean).join(' · ') : hint}>
        {stage && <StageBackdrop />}
        <div className="remote-frame" ref={frame} style={frameStyle}>
          <img
            ref={img}
            src={src}
            alt={alt}
            width={width}
            height={height}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            onClick={onTap ? tap : undefined}
            className={onTap ? 'tappable' : practicePhoto ? 'practice-cutout' : undefined}
          />
          {stage && usable && settled && stage.callout && stage.callout.length <= 26 &&
            <ButtonCallout box={hotspot} label={stage.callout} layout={detail ? 'detail' : 'full'} />}
          {stage && usable && settled && <PressCue key={stage.stepId + ':' + replay} box={hotspot} neighbours={stage.neighbours}
            motion={!stage.paused && !reduce} />}
          {!stage && hotspot && status === 'loaded' && (
            <div className={`ring ring-${ringStyle}`} aria-hidden="true" data-testid="hotspot" style={hotspotStyle(hotspot)} />
          )}
        </div>
      </div>
      {stage ? <figcaption className="stage-tools">{usable ?
        <button className="stage-view" type="button" onClick={() => setView(detail ? 'full' : 'detail')}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="10" cy="10" r="6.2" /><path d="m15 15 5 5m-13-10h6" />{!detail && <path d="M10 7v6" />}
          </svg>{detail ? stage.full : stage.detail}
        </button> : <span className="stage-label">{stage.label}</span>}
      </figcaption> : <figcaption className="hint">{hint}</figcaption>}
    </figure>
  );
}
