import { useEffect, useRef, useState } from 'react';
import type { BBox, ClarificationAnswers, GuideResult, ObservedControl } from '../../shared/guide';
import type { Locale } from '../data';
import { STRINGS } from '../i18n';
import { RemoteImage } from '../player/RemoteImage';
import { StepPlayer, type PlayerStep } from '../player/StepPlayer';
import { ApiError, getHealth, requestGuide, speakUrl, transcribe, type Health } from './api';
import { BLUR_THRESHOLD, normalizePhoto, PhotoError, type NormalizedPhoto, type PhotoErrorCode } from './photo';
import { GM_STRINGS } from './strings';
import { useRecorder } from './useRecorder';
import type { FamilySeed } from '../family/draft';
import { FAMILY } from '../family/strings';
import { FlowHeading, Icon } from '../ui/Icon';

type Phase = 'start' | 'photo' | 'task' | 'working' | 'result' | 'error';

const PHOTO_ERR: Record<PhotoErrorCode, 'errNotImage' | 'errHeic' | 'errUnreadable' | 'errTooBig' | 'errTooSmall'> = {
  not_image: 'errNotImage',
  heic: 'errHeic',
  unreadable: 'errUnreadable',
  too_big: 'errTooBig',
  too_small: 'errTooSmall',
};

/** Square-ish box around a tapped point, in normalized coordinates, kept inside the image. */
export function boxAroundTap(pt: { x: number; y: number }, img: { width: number; height: number }, size = 0.12): BBox {
  const w = Math.min(size, 1);
  const h = Math.min(size * (img.width / img.height), 1);
  return { x: Math.min(Math.max(pt.x - w / 2, 0), 1 - w), y: Math.min(Math.max(pt.y - h / 2, 0), 1 - h), w, h };
}

export function toPlayerSteps(result: GuideResult): PlayerStep[] {
  return result.steps.map((s) => {
    const matches = result.observedControls.filter(c => c.id === s.controlId);
    const c = matches.length === 1 ? matches[0] : undefined;
    return {
      id: s.id,
      hotspot: c?.display === 'box' && c.confidence === 'high' ? c.bbox : undefined,
      button: c ? (s.screenLabel ? `${c.label} → ${s.screenLabel}` : c.label) : s.screenLabel ?? undefined,
      instruction: s.instruction,
      expected: s.expectedState,
      recovery: s.mismatchRecovery,
    };
  });
}

function PhotoInputs({ onFile, camRef, galRef }: { onFile: (f: File) => void; camRef: React.RefObject<HTMLInputElement | null>; galRef: React.RefObject<HTMLInputElement | null> }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  };
  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} data-testid="camera-input" />
      <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={pick} data-testid="gallery-input" />
    </>
  );
}

export function GuideMe({ locale, onLocale, onFamily }: { locale: Locale; onLocale: (l: Locale) => void; onFamily?: (seed: FamilySeed) => void }) {
  const g = GM_STRINGS[locale];
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('start');
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<NormalizedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [request, setRequest] = useState('');
  const [answers, setAnswers] = useState<ClarificationAnswers>({});
  const [result, setResult] = useState<GuideResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [guideKey, setGuideKey] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastPhase = useRef(phase);
  const lastScreen = useRef<Blob | undefined>(undefined);
  const holdStart = useRef(0);

  useEffect(() => {
    getHealth().then(setHealth);
  }, []);

  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    headingRef.current?.focus();
  }, [phase]);

  useEffect(() => () => abort.current?.abort(), []);

  const recorder = useRecorder(async (blob) => {
    setTranscribing(true);
    setVoiceError(null);
    try {
      const text = await transcribe(blob, locale);
      setRequest((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      textRef.current?.focus();
    } catch (err) {
      setVoiceError(err instanceof ApiError ? err.message : g.micFailed);
    } finally {
      setTranscribing(false);
    }
  });

  const onPhoto = async (file: File) => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const p = await normalizePhoto(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto(p);
      setAnswers({});
    } catch (err) {
      setPhotoError(g[PHOTO_ERR[err instanceof PhotoError ? err.code : 'unreadable']]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const generate = async (nextAnswers: ClarificationAnswers = answers, screenImage?: Blob) => {
    if (!photo) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setAnswers(nextAnswers);
    if (screenImage) lastScreen.current = screenImage;
    setPhase('working');
    setError(null);
    try {
      const r = await requestGuide({ image: photo.blob, screenImage: screenImage ?? lastScreen.current, request: request.trim(), locale, answers: nextAnswers }, ctrl.signal);
      setResult(r);
      setGuideKey((k) => k + 1);
      setPhase('result');
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof ApiError ? err.message : String(err));
      setPhase('error');
    }
  };

  const onScreenPhoto = async (file: File, extra: ClarificationAnswers = {}) => {
    try {
      const p = await normalizePhoto(file);
      URL.revokeObjectURL(p.url);
      await generate({ ...answers, ...extra }, p.blob);
    } catch (err) {
      setError(g[PHOTO_ERR[err instanceof PhotoError ? err.code : 'unreadable']]);
      setPhase('error');
    }
  };

  const startOver = () => {
    abort.current?.abort();
    setPhase('photo');
    setResult(null);
    setAnswers({});
    lastScreen.current = undefined;
    setRequest('');
  };

  if (!health?.guide) {
    return (
      <main className="flow">
        <FlowHeading icon="camera" title={g.title} />
        {health === undefined ? <p role="status">{g.checking}</p> : (
          <div className="stack">
            <p role="alert" className="catalog-empty">{health === null ? g.serverMissing : g.guideUnconfigured}</p>
            <button type="button" className="btn btn-secondary" onClick={() => { setHealth(undefined); getHealth().then(setHealth); }}>{g.tryAgain}</button>
            <a className="btn btn-primary" href={`?flow=presets&lang=${locale}`}><Icon name="library" />{g.readyMade}</a>
          </div>
        )}
      </main>
    );
  }

  const screenInput = (extra?: ClarificationAnswers) => (
    <input ref={screenRef} type="file" accept="image/*" capture="environment" hidden data-testid="screen-input"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) onScreenPhoto(f, extra);
      }}
    />
  );

  if (phase === 'start') {
    return (
      <main className="flow">
        <FlowHeading icon="camera" title={g.title} headingRef={headingRef} />
        <fieldset className="lang-choice">
          <legend>{g.chooseLanguage}</legend>
          {(['ml', 'en'] as const).map((l) => (
            <button key={l} type="button" lang={l} aria-pressed={locale === l} className={`btn ${locale === l ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onLocale(l)}>
              {l === 'ml' ? 'മലയാളം' : 'English'}
            </button>
          ))}
        </fieldset>
        <section className="consent" aria-labelledby="consent-title">
          <h2 id="consent-title">{g.consentTitle}</h2>
          <p>{health.demo ? g.consentDemo : g.consentBody}</p>
          {health.speech && !health.demo && <p>{g.consentVoice}</p>}
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{g.consentCheck}</span>
          </label>
        </section>
        {health?.demo && <p className="badge badge-demo">⚠ {g.demoBadge}</p>}
        <button type="button" className="btn btn-primary" disabled={!consent} onClick={() => setPhase('photo')}>{g.continue}</button>
      </main>
    );
  }

  if (phase === 'photo') {
    const blurry = photo && photo.sharpness < BLUR_THRESHOLD;
    return (
      <main className="flow">
        <FlowHeading icon="camera" title={g.photoTitle} headingRef={headingRef} />
        <PhotoInputs onFile={onPhoto} camRef={camRef} galRef={galRef} />
        {photoBusy && <p role="status">{g.processing}</p>}
        {photoError && <p className="error-box" role="alert">{photoError}</p>}
        {photo ? (
          <>
            <div data-testid="photo-preview" data-sharpness={Math.round(photo.sharpness)} data-size={`${photo.width}x${photo.height}`}>
              <RemoteImage src={photo.url} width={photo.width} height={photo.height} alt={g.photoTitle} failedText={g.errUnreadable} hint="" frameWidth="100%" />
            </div>
            {blurry && <p className="warn-box" role="alert" data-testid="blur-warning">{g.blurry}</p>}
            <div className="nav-row">
              <button type="button" className="btn btn-secondary" onClick={() => camRef.current?.click()}>↺ {g.retake}</button>
              <button type="button" className="btn btn-primary" onClick={() => setPhase('task')}>{blurry ? g.useAnyway : g.usePhoto}</button>
            </div>
          </>
        ) : (
          <section className="flow-panel photo-picker stack">
            <p>{g.photoHelp}</p>
            <div className="stack">
              <button type="button" className="btn btn-primary" onClick={() => camRef.current?.click()}><Icon name="camera" />{g.takePhoto}</button>
              <button type="button" className="btn btn-secondary" onClick={() => galRef.current?.click()}>{g.gallery}</button>
            </div>
          </section>
        )}
      </main>
    );
  }

  if (phase === 'task') {
    const rec = recorder.state;
    return (
      <main className="flow">
        <FlowHeading icon="mic" title={g.taskTitle} description={g.taskHelp} headingRef={headingRef} />
        {health.speech && rec !== 'unsupported' && (
          <button
            type="button"
            className={`btn btn-mic ${rec === 'recording' ? 'is-recording' : ''}`}
            aria-disabled={transcribing || rec === 'starting'}
            onPointerDown={(e) => {
              if (e.button !== 0 || transcribing) return;
              if (rec === 'recording') return recorder.stop();
              holdStart.current = Date.now();
              recorder.start();
            }}
            onPointerUp={() => {
              if (rec === 'recording' && Date.now() - holdStart.current > 500) recorder.stop();
            }}
            onClick={(e) => {
              if (e.detail !== 0 || transcribing) return; // keyboard activation toggles
              if (rec === 'recording') recorder.stop();
              else recorder.start();
            }}
          >
            <span aria-hidden="true">●</span> {rec === 'recording' ? `${g.tapToStop} · ${g.recording(recorder.remaining)}` : g.holdToTalk}
          </button>
        )}
        <div role="status" aria-live="polite">
          {transcribing && <p>{g.transcribing}</p>}
          {rec === 'denied' && <p className="warn-box">{g.micDenied}</p>}
          {!health.speech && <p className="muted">{g.typeOnly}</p>}
          {health.speech && rec === 'unsupported' && <p className="muted">{g.micUnsupported}</p>}
          {(rec === 'failed' || voiceError) && <p className="warn-box">{voiceError ?? g.micFailed}</p>}
        </div>
        <label className="field">
          <span>{g.transcriptLabel}</span>
          <textarea ref={textRef} value={request} maxLength={500} rows={3} lang={locale} onChange={(e) => setRequest(e.target.value)} />
        </label>
        <div className="nav-row">
          <button type="button" className="btn btn-secondary" onClick={() => setPhase('photo')}>← {g.backToPhoto}</button>
          <button type="button" className="btn btn-primary" disabled={!request.trim() || transcribing || rec === 'recording'} onClick={() => generate({})}>{g.generate}</button>
        </div>
      </main>
    );
  }

  if (phase === 'working') {
    return (
      <main className="flow" aria-busy="true">
        <FlowHeading icon="camera" title={g.title} headingRef={headingRef} />
        <p role="status" className="working"><span className="spinner" aria-hidden="true" /> {g.working}</p>
        <button type="button" className="btn btn-secondary" onClick={() => { abort.current?.abort(); setPhase('task'); }}>{g.cancel}</button>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="flow">
        <FlowHeading icon="camera" title={g.errorTitle} headingRef={headingRef} />
        <p className="error-box" role="alert">{error}</p>
        <div className="stack">
          <button type="button" className="btn btn-primary" onClick={() => generate()}>{g.tryAgain}</button>
          <button type="button" className="btn btn-secondary" onClick={() => setPhase('task')}>← {g.taskTitle}</button>
          <button type="button" className="btn btn-secondary" onClick={startOver}>↺ {g.startOver}</button>
        </div>
      </main>
    );
  }

  if (!result || !photo) return null;
  const rl = result.locale;
  const rg = GM_STRINGS[rl];

  if (result.status === 'ready') {
    const narrationById = new Map(result.steps.map((s) => [s.id, s.narration]));
    return (
      <div lang={rl}>
        {screenInput()}
        <StepPlayer
          key={guideKey}
          title={result.task.summary || rg.title}
          subtitle={result.deviceCandidates[0]?.family ?? ''}
          badge={result.demo ? { tone: 'demo', text: rg.demoBadge } : { tone: 'live', text: rg.liveBadge }}
          steps={toPlayerSteps(result)}
          image={{ src: photo.url, width: photo.width, height: photo.height, alt: rg.photoTitle, frameWidth: '100%' }}
          locale={rl}
          t={STRINGS[rl]}
          labels={{ no: rg.screenNo }}
          controls={result.observedControls.filter(c => c.display === 'box').map(c => c.bbox)}
          speak={health?.speech && !health.demo ? (step) => speakUrl(rl, narrationById.get(step.id) ?? step.instruction, result.narrationTokens[step.id] ?? '') : undefined}
          mismatchExtra={(step) => (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setAnswers((a) => ({ ...a, mismatch: { stepId: step.id, expected: step.expected.slice(0, 300) } }));
                screenRef.current?.click();
              }}
            >
              {rg.screenPhoto}
            </button>
          )}
          footer={
            <>
              {result.evidenceRefs.length > 0 && (
                <p className="evidence">
                  {rg.basedOn}: {result.evidenceRefs.map((r) => r.title).join(' · ')}
                </p>
              )}
              <button type="button" className="btn btn-secondary wide" onClick={startOver}>↺ {rg.startOver}</button>
              {onFamily && <button type="button" className="btn btn-secondary wide"
                onClick={() => onFamily({ source: 'session', result, photo })}>{FAMILY[rl].create}</button>}
            </>
          }
        />
      </div>
    );
  }

  if (result.status === 'unsupported') {
    return (
      <main className="flow" lang={rl}>
        <FlowHeading icon="camera" title={rg.unsupportedTitle} headingRef={headingRef} />
        {result.demo && <p className="badge badge-demo">⚠ {rg.demoBadge}</p>}
        <p className="warn-box" role="alert">{result.unsupportedReason}</p>
        <div className="stack">
          <button type="button" className="btn btn-primary" onClick={() => setPhase('task')}>← {rg.taskTitle}</button>
          <button type="button" className="btn btn-secondary" onClick={startOver}>↺ {rg.startOver}</button>
        </div>
      </main>
    );
  }

  return (
    <Clarify
      key={guideKey}
      result={result}
      photo={photo}
      headingRef={headingRef}
      screenInput={screenInput()}
      onScreenPhoto={() => screenRef.current?.click()}
      onRetake={() => { setAnswers({}); setPhase('photo'); }}
      onAnswer={(a) => generate({ ...answers, ...a, confirmedControlIds: [...(answers.confirmedControlIds ?? []), ...(a.confirmedControlIds ?? [])], rejectedControlIds: [...(answers.rejectedControlIds ?? []), ...(a.rejectedControlIds ?? [])], textOnlyControlIds: [...(answers.textOnlyControlIds ?? []), ...(a.textOnlyControlIds ?? [])], userControls: [...(answers.userControls ?? []), ...(a.userControls ?? [])] })}
      onStartOver={startOver}
    />
  );
}

function Clarify({ result, photo, headingRef, screenInput, onScreenPhoto, onRetake, onAnswer, onStartOver }: {
  result: GuideResult;
  photo: NormalizedPhoto;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  screenInput: React.ReactNode;
  onScreenPhoto: () => void;
  onRetake: () => void;
  onAnswer: (a: ClarificationAnswers) => void;
  onStartOver: () => void;
}) {
  const g = GM_STRINGS[result.locale];
  const c = result.clarification!;
  const [text, setText] = useState('');
  const [marking, setMarking] = useState(false);
  const [mark, setMark] = useState<BBox | null>(null);
  const control: ObservedControl | undefined = c.controlId ? result.observedControls.find((x) => x.id === c.controlId) : undefined;

  return (
    <main className="flow" lang={result.locale}>
      <FlowHeading icon="camera" title={g.clarifyTitle} headingRef={headingRef} />
      {result.demo && <p className="badge badge-demo">⚠ {g.demoBadge}</p>}
      <p className="question" role="alert">{c.question}</p>
      {screenInput}

      {c.kind === 'clearer_photo' && (
        <button type="button" className="btn btn-primary" onClick={onRetake}>↺ {g.retake}</button>
      )}

      {c.kind === 'screen_photo' && (
        <button type="button" className="btn btn-primary" onClick={onScreenPhoto}>{g.screenPhoto}</button>
      )}

      {(c.kind === 'tv_model' || c.kind === 'screen_photo' || c.kind === 'text') && (
        <form className="field" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(c.kind === 'text' ? { note: text.trim() } : { tvModel: text.trim() }); }}>
          <label>
            <span>{c.kind === 'text' ? g.answerLabel : g.tvModelLabel}</span>
            <input type="text" value={text} maxLength={c.kind === 'text' ? 300 : 80} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-secondary" disabled={!text.trim()}>{g.send}</button>
        </form>
      )}

      {c.kind === 'confirm_button' && control && (
        <>
          <RemoteImage
            src={photo.url}
            width={photo.width}
            height={photo.height}
            alt={g.photoTitle}
            hotspot={marking ? mark ?? undefined : control.bbox}
            ringStyle={marking ? 'mark' : 'guide'}
            failedText={g.errUnreadable}
            hint={marking ? g.tapHint : ''}
            frameWidth="100%"
            onTap={marking ? (pt) => setMark(boxAroundTap(pt, photo)) : undefined}
          />
          {!marking ? (
            <div className="stack">
              <button type="button" className="btn btn-yes" onClick={() => onAnswer({ confirmedControlIds: [control.id] })}>✓ {g.yesThatsIt}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setMarking(true)}>{g.noMark}</button>
              <button type="button" className="btn btn-secondary" onClick={() => onAnswer({ textOnlyControlIds: [control.id] })}>{g.textOnly}</button>
            </div>
          ) : (
            <div className="stack">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!mark}
                onClick={() => mark && onAnswer({ rejectedControlIds: [control.id], userControls: [{ id: control.id, label: control.label, role: control.role, bbox: mark }] })}
              >
                {g.useMarked}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => onAnswer({ textOnlyControlIds: [control.id] })}>{g.textOnly}</button>
            </div>
          )}
        </>
      )}

      <button type="button" className="btn btn-secondary wide" onClick={onStartOver}>↺ {g.startOver}</button>
    </main>
  );
}
