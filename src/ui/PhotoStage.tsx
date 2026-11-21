import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Hotspot } from '../data/types';
import './photo-stage.css';

/** Registration marks on the stage, outside the photograph's coordinate system. */
export function StageBackdrop() {
  const dots = useId();
  return <svg className="stage-drawing" viewBox="0 0 480 320" fill="none" aria-hidden="true" focusable="false">
    <defs><pattern id={dots} width="13" height="13" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r=".85" fill="currentColor" opacity=".36" />
    </pattern></defs>
    <ellipse cx="240" cy="160" rx="176" ry="139" fill={'url(#' + dots + ')'} />
    <g stroke="currentColor" strokeWidth=".85">
      <ellipse cx="240" cy="160" rx="175" ry="139" strokeDasharray="1.7 6" opacity=".5" />
      <ellipse cx="240" cy="160" rx="154" ry="120" opacity=".58" />
      <path d="M70 77h23m-11.5-11.5v23m306 147h19m-9.5-9.5v19" />
    </g>
  </svg>;
}

/** The leader starts at the measured button and its label stays level, even on the angled cover photo. */
export function ButtonCallout({ box, label, layout }: { box: Hotspot; label: string; layout?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  const [side, setSide] = useState<'right' | 'left' | 'hidden'>('hidden');
  useLayoutEffect(() => {
    const origin = anchor.current, text = tag.current;
    const stage = origin?.closest<HTMLElement>('[data-photo-stage]');
    if (!origin || !text || !stage) return;
    const measure = () => {
      const point = origin.getBoundingClientRect(), bounds = stage.getBoundingClientRect();
      const needed = text.offsetWidth + 12;
      const atTop = point.top - bounds.top < text.offsetHeight;
      const rightFits = bounds.right - point.left >= needed;
      const leftFits = point.left - bounds.left >= needed;
      let side: 'right' | 'left' | 'hidden' = 'hidden';
      if (!atTop && rightFits) side = 'right';
      else if (!atTop && leftFits) side = 'left';
      setSide(side);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage); observer.observe(text);
    return () => observer.disconnect();
  }, [box, label, layout]);
  return <span ref={anchor} className="callout-anchor" aria-hidden="true" data-side={side} style={{
    left: (box.x + box.w / 2) * 100 + '%', top: (box.y + box.h / 2) * 100 + '%',
  }}>
    <span className="callout-level"><span className="callout-body" ref={tag}>
      <svg className="callout-leader" viewBox="0 0 54 27" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 26.5h11L37 1h17" fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" /></svg>
      <span className="callout-label">{label}</span>
    </span></span>
  </span>;
}
