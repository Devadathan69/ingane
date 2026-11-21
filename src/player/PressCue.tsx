import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Hotspot } from '../data/types';
import { validateHotspot } from '../data/validate';

export function hotspotStyle(h: Hotspot) {
  return { left: h.x * 100 + '%', top: h.y * 100 + '%', width: h.w * 100 + '%', height: h.h * 100 + '%' };
}

/** A single known button is the only valid target for a press. */
export function isPressTarget(box?: Hotspot): box is Hotspot {
  return !!box && validateHotspot(box, 'press').length === 0;
}

// The palm extends away from the tip. Pick the side with the least overlap
// with other known controls, preferring open space towards the photo edge.
function approachSide(box: Hotspot, neighbours: Hotspot[], frame: HTMLElement, stage: HTMLElement) {
  const w = frame.clientWidth, h = frame.clientHeight;
  const x = (box.x + box.w / 2) * w, y = (box.y + box.h / 2) * h;
  const hand = Math.min(68, Math.max(48, stage.clientWidth * .14));
  const dy = box.y + box.h / 2 > .72 ? -1 : 1;
  const top = dy > 0 ? y - 6 : y - hand * .58, bottom = dy > 0 ? y + hand * .58 : y + 6;
  const score = (direction: number) => {
    const left = direction > 0 ? x : x - hand, right = left + hand;
    let area = Math.max(0, -frame.offsetLeft - left, right + frame.offsetLeft - stage.clientWidth) * hand;
    for (const n of neighbours) {
      if (!isPressTarget(n) || (n.x === box.x && n.y === box.y && n.w === box.w && n.h === box.h)) continue;
      area += Math.max(0, Math.min(right, (n.x + n.w) * w) - Math.max(left, n.x * w)) *
        Math.max(0, Math.min(bottom, (n.y + n.h) * h) - Math.max(top, n.y * h));
    }
    return area;
  };
  const difference = score(1) - score(-1);
  return { dx: difference === 0 ? (x >= w / 2 ? 1 : -1) : difference < 0 ? 1 : -1, dy };
}

export function PressCue({ box, neighbours, motion }: { box: Hotspot; neighbours: Hotspot[]; motion: boolean }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState({ dx: 1, dy: 1 });
  useLayoutEffect(() => {
    const frame = anchor.current?.parentElement, stage = frame?.parentElement;
    if (!motion || !frame || !stage) return;
    const measure = () => {
      const next = approachSide(box, neighbours, frame, stage);
      setSide(prev => prev.dx === next.dx && prev.dy === next.dy ? prev : next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watcher = new ResizeObserver(measure);
    watcher.observe(frame); watcher.observe(stage);
    return () => watcher.disconnect();
  }, [box, neighbours, motion]);

  return <>
    <div className={'ring press-outline' + (motion ? ' press-contact' : '')} data-testid="hotspot" aria-hidden="true" style={hotspotStyle(box)} />
    {motion && <div className="press-anchor" aria-hidden="true" ref={anchor} style={{
      left: (box.x + box.w / 2) * 100 + '%', top: (box.y + box.h / 2) * 100 + '%',
      '--approach-x': side.dx * 36 + 'px', '--approach-y': side.dy * 15 + 'px',
    } as CSSProperties}>
      <div className="press-travel"><PressHand dx={side.dx} dy={side.dy} /></div>
    </div>}
  </>;
}

export function PressHand({ dx = 1, dy = 1 }: { dx?: number; dy?: number }) {
  return <svg viewBox="0 0 64 42" className="press-hand" focusable="false" aria-hidden="true"
    style={{ transform: 'scale(' + dx + ', ' + dy + ')' }}>
    {/* The index fingertip is (0, 0). The viewBox origin sits exactly on the hotspot centre. */}
    <path d="M0 0 C0 -2 1.8 -3.6 4.1 -3.3 L24.5 -.7 C22.1 -3 22.8 -6.2 25.7 -6.4
      C27.7 -6.8 30 -5.5 32.3 -3.8 C33 -7.1 36.5 -7.4 39 -5.1 L42 -2.5
      C43.4 -4.4 46.2 -4.1 48.8 -1.7 L54.6 4.2 C58.4 8 59.7 12.2 59.2 18.2
      L58.5 24.4 L63 28 L52.8 39 L43 31.6 C37.3 31.1 31.6 28.1 26.9 24
      L17.1 15.8 C14.6 13.7 15 10.3 17.8 9.8 C20.2 9.4 23.4 11.5 27.3 13.5
      L28.6 13.6 L24.1 8.3 L4 3.5 C1.7 3 0 2 0 0Z"
      fill="#ffe1aa" stroke="#342f20" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M25 -.4l5.3 4.6m2.1-7.5 5.7 5.4m4.2-4.4 4.5 4.5M18 11.5c2.4-.2 5.4 2.1 7.2 3.3"
      fill="none" stroke="#ab8650" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m58.2 21.9 6.7 5.1-12 14.1-6.4-5.1z" fill="#486854" stroke="#263d31" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>;
}
