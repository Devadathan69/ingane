import { useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Hotspot } from '../data';
import type { GuideLanguage } from '../../shared/languages';
import type { Strings } from '../i18n';
import { progressReducer, START } from './progress';
import { RemoteImage, useReducedMotion } from './RemoteImage';
import { Icon } from '../ui/Icon';
import { useStepNarration } from './useStepNarration';
import { narrationCopy } from './narrationCopy';
import './walkthrough.css';

/** A step already localized for display. Shared by V1 fixtures and V2 generated guides. */
export interface PlayerStep {
  id: string;
  hotspot?: Hotspot;
  /** Physical button named in text; omitted for screen-only steps. */
  button?: string;
  photoLabel?: string;
  buttonDescription?: string;
  confirmation?: string;
  instruction: string;
  expected: string;
  recovery: string;
  /** Pre-generated clip (V1). */
  audioUrl?: string;
  loadAudio?: () => Promise<string>;
  screenLabel?: string;
}

export interface StepPlayerProps {
  title: string;
  subtitle: string;
  subtitleInDetails?: boolean;
  badge?: { tone: 'sample' | 'verified' | 'demo' | 'live'; text: string; note?: string };
  before?: string;
  steps: PlayerStep[];
  image: { src: string; width: number; height: number; alt: string; frameWidth?: string };
  locale: GuideLanguage;
  contentLocale?: GuideLanguage;
  t: Strings;
  labels?: { yes?: string; no?: string; retry?: string };
  /** A partial guide continues outside the player after its last confirmation. */
  onConfirmLast?: () => void;
  /** On-demand narration (V2). Returns a playable URL; callers cache per session. */
  speak?: (step: PlayerStep) => Promise<string>;
  /** Live guidance speaks each new step by default; shared recordings stay tap-to-play. */
  autoNarration?: boolean;
  /** Extra recovery actions shown on mismatch (V2: photo of the TV screen). */
  mismatchExtra?: (step: PlayerStep) => ReactNode;
  footer?: ReactNode;
  legacy?: boolean;
  controls?: Hotspot[];
}

const BADGE_ICON = { sample: '⚠', verified: '✓', demo: '⚠', live: 'ⓘ' } as const;

export function StepPlayer({ title, subtitle, subtitleInDetails, badge, before, steps, image, locale, contentLocale, t, labels, onConfirmLast, speak, autoNarration = false, mismatchExtra, footer, legacy = false, controls }: StepPlayerProps) {
  const total = steps.length;
  const reducer = useMemo(() => progressReducer(total), [total]);
  const [state, dispatch] = useReducer(reducer, START);
  const step = steps[state.index];
  const heading = useRef<HTMLHeadingElement>(null);
  const recoveryHeading = useRef<HTMLHeadingElement>(null);
  const focusKey = JSON.stringify([step.id, state.index, state.done, state.mismatch, locale]);
  const lastFocus = useRef(focusKey);
  const introduced = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const [targetReady, setTargetReady] = useState(false);
  const [replayCount, setReplayCount] = useState(0);
  const reduce = useReducedMotion();
  const canPlay = !!(speak || step.audioUrl || step.loadAudio);
  const narrationKey = JSON.stringify([image.src, contentLocale ?? locale, step.id, step.instruction, step.audioUrl]);
  const narration = useStepNarration({
    stepKey: narrationKey,
    resetKey: focusKey,
    active: canPlay && !state.done && (!autoNarration || !state.mismatch),
    auto: autoNarration,
    url: step.audioUrl,
    load: step.loadAudio ?? (speak && (() => speak(step))),
  });
  const audioState = narration.state;
  const voiceCopy = narrationCopy[locale];

  const announcement = state.done
    ? `${t.doneTitle} ${t.doneBody}`
    : state.mismatch
      ? `${t.mismatchTitle}. ${step.recovery}`
      : `${t.stepOf(state.index + 1, total)}. ${step.button ? `${t.press}: ${step.button}` : step.instruction}`;

  useLayoutEffect(() => {
    if (state.done) introduced.current = true;
    if (!legacy && !state.done && !state.mismatch) document.scrollingElement?.scrollTo?.({ top: 0, behavior: 'instant' });
    if (lastFocus.current === focusKey) return;
    lastFocus.current = focusKey;
    if (!legacy && state.mismatch) recoveryHeading.current?.focus();
    else heading.current?.focus({ preventScroll: !legacy && !state.done });
  }, [focusKey, state.done, state.mismatch, legacy]);

  const progress = (
    <div className="progress" aria-hidden="true">
      {steps.map((s, i) => (
        <span key={s.id} className={i < state.index ? 'pip pip-done' : i === state.index ? 'pip pip-now' : 'pip'} />
      ))}
    </div>
  );
  const count = (
    <h2 id="step-heading" ref={heading} tabIndex={-1} className="step-count">
      {t.stepOf(state.index + 1, total)}
    </h2>
  );
  const beforeText = (
    state.index === 0 && before && (
      <p className="before">
        <strong>{t.beforeYouStart}:</strong> <span lang={contentLocale}>{before}</span>
      </p>
    )
  );
  const instruction = (
    <><p className="instruction" lang={contentLocale}>{step.instruction}</p>
    {step.screenLabel && <p className="expected-text"><bdi>{step.screenLabel}</bdi></p>}</>
  );
  const buttonName = (
    step.button && (
      <p className="button-name">
        <span className="label">{t.press}:</span> <strong lang={contentLocale}>{step.button}</strong>
      </p>
    )
  );
  const listen = (
    canPlay && (!autoNarration || !state.mismatch) && (
      <div className={autoNarration ? 'audio-row audio-row-auto' : 'audio-row'}>
        {(!autoNarration || !narration.muted) &&
          <button type="button" className="btn btn-secondary btn-listen" onClick={narration.play} disabled={audioState === 'loading'}>
            <span aria-hidden="true">{audioState === 'played' || audioState === 'playing' ? '↻' : '▶'}</span>{' '}
            {audioState === 'loading' ? t.audioLoading : audioState === 'played' || audioState === 'playing' ? t.replay :
              autoNarration && audioState === 'blocked' ? voiceCopy.blocked : t.play}
          </button>}
        {autoNarration &&
          <button type="button" className="btn btn-secondary btn-voice-toggle" onClick={narration.toggleMute}>
            {narration.muted ? voiceCopy.unmute : voiceCopy.mute}
          </button>}
        {audioState === 'failed' && <p className="audio-failed" role="status">{t.audioFailed}</p>}
      </div>
    )
  );
  const photo = (
    <RemoteImage
      key={image.src}
      src={image.src}
      width={image.width}
      height={image.height}
      alt={image.alt}
      frameWidth={image.frameWidth}
      stepId={step.id}
      hotspot={legacy || step.button?.trim() ? step.hotspot : undefined}
      stage={legacy ? undefined : { stepId: step.id, paused: state.mismatch, introduced,
        neighbours: controls ?? steps.flatMap(s => s.hotspot ? [s.hotspot] : []),
        label: t.remoteView, button: step.button, callout: step.photoLabel ?? step.button, full: t.fullRemote, detail: t.buttonDetail,
        replay: replayCount, viewport, reduce, onTarget: setTargetReady }}
      failedText={legacy ? t.imageFailed : [t.photoUnavailable, step.buttonDescription].filter(Boolean).join(' ')}
      hint={step.hotspot ? `${t.ringLegend} ${t.photoHint}` : t.photoHint}
    />
  );
  const expected = (
    <div className="expected">
      <p className={legacy ? 'label' : 'sr-only'}>{legacy ? t.expectedLabel + ':' : t.onTv}</p>
      <p className="expected-text" lang={contentLocale}>{step.expected}</p>
    </div>
  );
  const back = <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'back' })} disabled={state.index === 0}>
    {legacy ? '←' : <Icon name="back" />} {t.back}
  </button>;
  const modernTools = <div className="walk-secondary">
    {targetReady && !state.mismatch && <button type="button" className="btn btn-secondary stage-replay" onClick={() => {
      if (reduce) viewport.current?.focus(); else setReplayCount(n => n + 1);
    }}><Icon name="repeat" />{reduce ? t.showButton : t.showPress}</button>}
    <div className="nav-row">{back}</div>
  </div>;
  const actions = (
    state.mismatch ? (
      <div className="recovery" role="group" aria-labelledby="recovery-title">
        <h3 id="recovery-title" ref={legacy ? undefined : recoveryHeading} tabIndex={legacy ? undefined : -1}>{t.mismatchTitle}</h3>
        <p lang={contentLocale}>{step.recovery}</p>
        <p className="recovery-note">{t.mismatchNote}</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'retry' })}>
          {labels?.retry ?? t.retry}
        </button>
        {mismatchExtra?.(step)}
        {!legacy && back}
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'restart' })}>
          ↺ {t.restart}
        </button>
      </div>
    ) : (
      <div className="answer">
        <button type="button" className="btn btn-yes" lang={step.confirmation ? contentLocale : undefined} onClick={() => {
          if (onConfirmLast && state.index === total - 1) { narration.stop(); onConfirmLast(); }
          else dispatch({ type: 'confirm' });
        }}>
          {legacy && <span aria-hidden="true">✓</span>} {step.confirmation ?? labels?.yes ?? t.yes}
          {!legacy && <Icon name="arrow" />}
        </button>
        {!legacy && modernTools}
        <button type="button" className="btn btn-no" onClick={() => dispatch({ type: 'mismatch' })}>
          <span aria-hidden="true">✕</span> {labels?.no ?? (legacy ? t.no : t.screenDifferent)}
        </button>
      </div>
    )
  );
  const navigation = (
    <div className="nav-row">
      <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'back' })} disabled={state.index === 0}>
        ← {t.back}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'restart' })}>
        ↺ {t.restart}
      </button>
    </div>
  );

  const titleBlock = <h1 id="guide-title" className="guide-title" lang={contentLocale}>{title}</h1>;
  const statusBadge = badge && <div className={`badge badge-${badge.tone}`}>
    {legacy && <><span aria-hidden="true">{BADGE_ICON[badge.tone]}</span>{' '}</>}{badge.text}
  </div>;

  return (
    <main className={legacy ? 'player' : 'player walkthrough'} aria-labelledby="guide-title">
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
      {legacy ? <>{statusBadge}{badge?.note && <p className="sample-note">{badge.note}</p>}{titleBlock}<p className="device-name">{subtitle}</p></> :
        <header className="walk-heading"><div>{titleBlock}{subtitle && !subtitleInDetails && <p className="walk-subtitle">{subtitle}</p>}
          {!state.done && count}</div>{statusBadge}</header>}

      {state.done ? (
        <section className="done" aria-labelledby="step-heading">
          <div className="done-mark" aria-hidden="true">
            ✓
          </div>
          <h2 id="step-heading" ref={heading} tabIndex={-1}>
            {t.doneTitle}
          </h2>
          <p className="done-body">{t.doneBody}</p>
          <p className="expected-final" lang={contentLocale}>{steps[total - 1].expected}</p>
          <div className="nav-row">
            <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'back' })}>
              ← {t.back}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: 'restart' })}>
              ↺ {t.restart}
            </button>
          </div>
        </section>
      ) : legacy ? (
        <section className="step" aria-labelledby="step-heading">
          {progress}{count}{beforeText}{instruction}{buttonName}{listen}{photo}{expected}{actions}{navigation}
        </section>
      ) : (
        <section className="step walk-layout" aria-labelledby="step-heading">
          {photo}
          <div className="walk-paper">
            {progress}
            <p className="walk-button" lang={step.button ? contentLocale : undefined}>{step.button || t.checkpoint}</p>
            {instruction}{expected}{actions}
            {listen}
          </div>
        </section>
      )}

      {!legacy && <div className="walk-footer">
        {(before || badge?.note || (subtitleInDetails && subtitle) || (!state.done && step.buttonDescription)) && <details className="walk-context">
          <summary>{t.beforeYouStart}</summary>{subtitleInDetails && subtitle && <p className="device-name">{subtitle}</p>}
          {before && <p lang={contentLocale}>{before}</p>}{badge?.note && <p>{badge.note}</p>}
          {!state.done && step.buttonDescription && <p lang={contentLocale}>{step.buttonDescription}</p>}
        </details>}
        {!state.done && !state.mismatch && <button type="button" className="btn walk-restart" onClick={() => dispatch({ type: 'restart' })}>{t.restart}</button>}
      </div>}
      {footer}
      <p className="guides-note">{t.guidesNote}</p>
    </main>
  );
}
