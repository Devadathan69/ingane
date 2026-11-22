import { useEffect, useRef, useState } from 'react';
import type { BBox, ClarificationAnswers, GuideResult, ObservedControl } from '../../shared/guide';
import type { Locale } from '../data';
import { guideLanguages, languages, type GuideLanguage } from '../../shared/languages';
import { HDMI_COPY, hdmiText } from '../../shared/hdmi-copy';
import { wifiCopy } from '../../shared/wifi-copy';
import { InputList } from './InputList';
import { PhotoInputs } from './PhotoInputs';
import { GuidePlayer } from '../player/GuidePlayer';
import { STRINGS } from '../i18n';
import { RemoteImage } from '../player/RemoteImage';
import { type PlayerStep } from '../player/StepPlayer';
import { ApiError, getHealth, requestGuide, speakUrl, transcribe, type Health } from './api';
import { BLUR_THRESHOLD, normalizePhoto, PhotoError, type NormalizedPhoto, type PhotoErrorCode } from './photo';
import { GM_STRINGS } from './strings';
import { useRecorder } from './useRecorder';
import type { FamilySeed } from '../family/draft';
import { FAMILY } from '../family/strings';
import { FlowHeading, Icon } from '../ui/Icon';

type Phase = 'photo' | 'task' | 'working' | 'result' | 'input-list' | 'error';
type FlowError = { kind: 'timeout' } | { kind: 'other'; message: string };

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
      confirmation: result.hdmi && s.id === 'select-input' ? HDMI_COPY[result.locale].sawPicture :
        result.hdmi && s.id === 'highlight-input' && s.screenLabel ? hdmiText(HDMI_COPY[result.locale].highlighted, s.screenLabel) :
        result.task.type === 'wifi' && s.id === 'wifi-focus-item' ? s.expectedState :
        result.task.type === 'wifi' && s.id === 'wifi-finish-on-tv' ? s.expectedState : undefined,
      screenLabel: result.task.type === 'wifi' ? s.screenLabel ?? undefined : undefined,
      button: c ? (s.screenLabel ? `${c.label} → ${s.screenLabel}` : c.label) : result.hdmi || result.task.type === 'wifi' ? undefined : s.screenLabel ?? undefined,
      instruction: s.instruction,
      expected: s.expectedState,
      recovery: s.mismatchRecovery,
    };
  });
}

function ScreenPhotoReview({ photo, locale, safeNotice, cancel, send }: {
  photo: NormalizedPhoto; locale: Locale; safeNotice?: string; cancel: () => void; send: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const g = GM_STRINGS[locale];
  useEffect(() => {
    const el = dialog.current;
    if (el?.showModal) el.showModal();
    else el?.setAttribute('open', '');
    return () => el?.close?.();
  }, []);
  return <dialog ref={dialog} lang={locale} className="screen-review" aria-labelledby="screen-review-title"
    onCancel={e => { e.preventDefault(); cancel(); }}>
    <div className="stack"><h2 id="screen-review-title">{g.screenPreview}</h2>
      <img src={photo.url} alt={g.screenPreview} width={photo.width} height={photo.height} />
      <p>{STRINGS[locale].localPhoto}</p>
      {safeNotice && <p className="muted">{safeNotice}</p>}
      <button className="btn btn-primary" onClick={send}>{g.sendScreen}</button>
      <button className="btn btn-secondary" onClick={cancel}>{g.cancel}</button>
    </div>
  </dialog>;
}

export function GuideMe({ locale, initialFile, onFamily }: { locale: Locale; initialFile?: File; onFamily?: (seed: FamilySeed) => void }) {
  const g = GM_STRINGS[locale];
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('photo');
  const [language, setLanguage] = useState<GuideLanguage>(locale);
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<NormalizedPhoto | null>(null);
  const [pendingScreen, setPendingScreen] = useState<{ photo: NormalizedPhoto; answers: ClarificationAnswers } | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const opener = useRef<GuideResult | null>(null);
  const screenGallery = useRef<HTMLInputElement>(null);
  const screenAnswers = useRef<ClarificationAnswers>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [request, setRequest] = useState('');
  const [answers, setAnswers] = useState<ClarificationAnswers>({});
  const [result, setResult] = useState<GuideResult | null>(null);
  const [error, setError] = useState<FlowError | null>(null);
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
  const photoAttempt = useRef(0);
  const transcribeAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    getHealth().then(setHealth);
  }, []);

  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    headingRef.current?.focus();
  }, [phase]);

  useEffect(() => () => { abort.current?.abort(); transcribeAbort.current?.abort(); photoAttempt.current++; }, []);
  useEffect(() => () => { if (pendingScreen) URL.revokeObjectURL(pendingScreen.photo.url); }, [pendingScreen]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => { if (initialFile) void onPhoto(initialFile); }, [initialFile]);

  useEffect(() => {
    const pickers = [screenRef.current, screenGallery.current];
    const cancelled = () => setScreenError(HDMI_COPY[language].noCapture);
    for (const el of pickers) el?.addEventListener('cancel', cancelled);
    return () => { for (const el of pickers) el?.removeEventListener('cancel', cancelled); };
  }, [phase, result, language]);

  const recorder = useRecorder(async (blob) => {
    if (!consent) return;
    const controller = new AbortController();
    transcribeAbort.current = controller;
    setTranscribing(true);
    setVoiceError(null);
    try {
      const text = await transcribe(blob, language, controller.signal, locale);
      if (controller.signal.aborted) return;
      setRequest((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      textRef.current?.focus();
    } catch (err) {
      if (controller.signal.aborted) return;
      setVoiceError(err instanceof ApiError ? err.message : g.micFailed);
    } finally {
      if (!controller.signal.aborted) setTranscribing(false);
    }
  });

  const onPhoto = async (file: File) => {
    const attempt = ++photoAttempt.current;
    abort.current?.abort();
    transcribeAbort.current?.abort();
    setTranscribing(false);
    setPhase('photo');
    setPhotoBusy(true);
    setPhotoError(null);
    // A selected replacement invalidates the old photo even if decoding fails.
    // Cancelling a picker never calls onPhoto and leaves the old preview intact.
    setConsent(false);
    lastScreen.current = undefined;
    screenAnswers.current = {};
    opener.current = null;
    setPendingScreen(null);
    setScreenError(null);
    setResult(null);
    setError(null);
    setPhoto(null);
    setAnswers({});
    try {
      const p = await normalizePhoto(file);
      if (attempt !== photoAttempt.current) { URL.revokeObjectURL(p.url); return; }
      setPhoto(p);
    } catch (err) {
      if (attempt !== photoAttempt.current) return;
      setPhotoError(g[PHOTO_ERR[err instanceof PhotoError ? err.code : 'unreadable']]);
    } finally {
      if (attempt === photoAttempt.current) setPhotoBusy(false);
    }
  };

  const generate = async (nextAnswers: ClarificationAnswers = answers, screenImage?: Blob) => {
    if (!photo || !consent || !health?.guide) return;
    abort.current?.abort();
    photoAttempt.current++;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setAnswers(nextAnswers);
    if (nextAnswers.hdmi?.typedLabels) lastScreen.current = undefined;
    setScreenError(null);
    if (screenImage) lastScreen.current = screenImage;
    setPhase('working');
    setError(null);
    try {
      const r = await requestGuide({ image: photo.blob, screenImage: screenImage ?? lastScreen.current, request: request.trim(), locale: language, appLocale: locale, answers: nextAnswers }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (r.status === 'hdmi_checkpoint') opener.current = r;
      setResult(r);
      setGuideKey((k) => k + 1);
      setPhase('result');
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if (nextAnswers.hdmi?.listVisible) {
        setScreenError(err instanceof ApiError ? err.message : g.tryAgain);
        setPhase('input-list');
        return;
      }
      const timedOut = err instanceof ApiError && err.code === 'timeout';
      setError(timedOut ? { kind: 'timeout' } : { kind: 'other', message: err instanceof ApiError ? err.message : String(err) });
      setPhase('error');
    }
  };

  const onScreenPhoto = async (file: File) => {
    const attempt = ++photoAttempt.current;
    const next = { ...answers, ...screenAnswers.current };
    screenAnswers.current = {};
    if (next.hdmi) next.hdmi = { photoId: next.hdmi.photoId, layoutId: next.hdmi.layoutId, listVisible: true };
    setScreenError(null);
    try {
      const p = await normalizePhoto(file);
      if (attempt !== photoAttempt.current) { URL.revokeObjectURL(p.url); return; }
      setPendingScreen({ photo: p, answers: next });
    } catch (err) {
      if (attempt !== photoAttempt.current) return;
      const code = err instanceof PhotoError ? err.code : 'unreadable';
      const message = next.hdmi && code === 'too_small' ? HDMI_COPY[language].screenSize : g[PHOTO_ERR[code]];
      if (next.hdmi) { setScreenError(message); return; }
      setError({ kind: 'other', message });
      setPhase('error');
    }
  };

  const startOver = () => {
    abort.current?.abort();
    transcribeAbort.current?.abort();
    photoAttempt.current++;
    opener.current = null;
    screenAnswers.current = {};
    setPendingScreen(null);
    setPhotoBusy(false);
    setPhotoError(null);
    setScreenError(null);
    setPhase('photo');
    setResult(null);
    setConsent(false);
    setPhoto(null);
    setAnswers({});
    lastScreen.current = undefined;
    setRequest('');
  };

  const screenInput = () => (<>
    <input ref={screenRef} type="file" accept="image/*" capture="environment" hidden data-testid="screen-input"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void onScreenPhoto(f);
      }}
    />
    <input ref={screenGallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden data-testid="screen-gallery"
      onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void onScreenPhoto(file); }} />
    {pendingScreen && <ScreenPhotoReview photo={pendingScreen.photo} locale={locale} safeNotice={result?.task.type === 'wifi' ? wifiCopy(locale).photo : undefined} cancel={() => setPendingScreen(null)}
      send={() => { void generate(pendingScreen.answers, pendingScreen.photo.blob); setPendingScreen(null); }} />}
  </>);

  if (phase === 'photo') {
    const blurry = photo && photo.sharpness < BLUR_THRESHOLD;
    const lowLight = photo?.lowLight;
    return (
      <main className="flow">
        <FlowHeading icon="camera" title={g.photoTitle} headingRef={headingRef} />
        <PhotoInputs onFile={onPhoto} camRef={camRef} galRef={galRef} />
        {health !== undefined && !health?.guide && <div className="stack">
          <p role="alert" className="catalog-empty">{health === null ? g.serverMissing : g.guideUnconfigured}</p>
          <button className="btn btn-secondary" onClick={() => { setHealth(undefined); getHealth().then(setHealth); }}>{g.tryAgain}</button>
          <a className="btn btn-secondary" href={`?flow=presets&lang=${locale}`}>{g.readyMade}</a>
        </div>}
        {photoBusy && <p role="status">{g.processing}</p>}
        {photoError && <p className="error-box" role="alert">{photoError}</p>}
        {photo ? (
          <>
            <div data-testid="photo-preview" data-sharpness={Math.round(photo.sharpness)} data-size={`${photo.width}x${photo.height}`}>
              <RemoteImage src={photo.url} width={photo.width} height={photo.height} alt={g.photoTitle} failedText={g.errUnreadable} hint="" frameWidth="100%" />
            </div>
            {lowLight && <p className="warn-box" role="alert" data-testid="dark-warning">{g.darkPhoto}</p>}
            {blurry && !lowLight && <p className="warn-box" role="alert" data-testid="blur-warning">{g.blurry}</p>}
            <div className="stack">
              <button type="button" className="btn btn-primary" disabled={photoBusy} onClick={() => setPhase('task')}>{blurry || lowLight ? g.useAnyway : g.usePhoto}</button>
              <button className="btn btn-secondary" onClick={() => camRef.current?.click()}>{g.retake}</button>
              <button className="btn btn-secondary" onClick={() => galRef.current?.click()}>{STRINGS[locale].choosePhoto}</button>
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
        <a className="btn btn-secondary" href={`?lang=${locale}`}>{g.cancel}</a>
      </main>
    );
  }

  if (phase === 'task') {
    const rec = recorder.state;
    const speechInput = health?.speech && languages[language].stt;
    return (
      <main className="flow">
        <FlowHeading icon="mic" title={g.taskTitle} description={g.taskHelp} headingRef={headingRef} />
        <label className="field">{g.chooseLanguage}<select value={language} disabled={transcribing || rec === 'recording' || rec === 'starting'}
          onChange={e => setLanguage(e.target.value as GuideLanguage)}>
          {guideLanguages.map(l => <option lang={l} key={l} value={l}>{languages[l].native}</option>)}
        </select></label>
        {health?.guide ? <section className="consent" aria-label={g.consentTitle}>
          <p>{health.demo ? g.consentDemo : g.consentBody}</p>
          {health.speech && !health.demo && <p>{g.consentVoice}</p>}
          <label className="check"><input type="checkbox" checked={consent} disabled={transcribing || rec === 'recording' || rec === 'starting'}
            onChange={e => setConsent(e.target.checked)} />{g.consentCheck}</label>
        </section> : <div className="stack"><p role="status">{health === undefined ? g.checking : health === null ? g.serverMissing : g.guideUnconfigured}</p>
          <button className="btn btn-secondary" onClick={() => getHealth().then(setHealth)}>{g.tryAgain}</button></div>}
        {speechInput && rec !== 'unsupported' && (
          <button
            type="button"
            className={`btn btn-mic ${rec === 'recording' ? 'is-recording' : ''}`}
            disabled={!consent} aria-disabled={!consent || transcribing || rec === 'starting'}
            onPointerDown={(e) => {
              if (e.button !== 0 || transcribing || rec === 'starting') return;
              if (rec === 'recording') return recorder.stop();
              holdStart.current = Date.now();
              recorder.start();
            }}
            onPointerUp={() => {
              if (rec === 'recording' && Date.now() - holdStart.current > 500) recorder.stop();
            }}
            onClick={(e) => {
              if (e.detail !== 0 || transcribing || rec === 'starting') return; // keyboard activation toggles
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
          {!speechInput && <p className="muted">{g.typeOnly}</p>}
          {speechInput && rec === 'unsupported' && <p className="muted">{g.micUnsupported}</p>}
          {(rec === 'failed' || voiceError) && <p className="warn-box">{voiceError ?? g.micFailed}</p>}
        </div>
        <label className="field">
          <span>{g.transcriptLabel}</span>
          <textarea ref={textRef} value={request} maxLength={500} rows={3} lang={language} onChange={(e) => setRequest(e.target.value)} />
        </label>
        <div className="nav-row">
          <button type="button" className="btn btn-secondary" disabled={transcribing || rec === 'recording' || rec === 'starting'} onClick={() => setPhase('photo')}>← {g.backToPhoto}</button>
          <button type="button" className="btn btn-primary" disabled={!health?.guide || !consent || !request.trim() || transcribing || rec === 'recording' || rec === 'starting'} onClick={() => { opener.current = null; lastScreen.current = undefined; void generate({}); }}>{g.generate}</button>
        </div>
      </main>
    );
  }

  if (phase === 'working') {
    return (
      <main className="flow" aria-busy="true">
        <FlowHeading icon="camera" title={g.title} headingRef={headingRef} />
        <p role="status" className="working"><span className="spinner" aria-hidden="true" /> {g.working}</p>
        <button type="button" className="btn btn-secondary" onClick={() => { abort.current?.abort(); photoAttempt.current++; setPhase(answers.hdmi?.listVisible && result ? 'input-list' : 'task'); }}>{g.cancel}</button>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="flow">
        <FlowHeading icon="camera" title={error?.kind === 'timeout' ? g.timeoutTitle : g.errorTitle} headingRef={headingRef} />
        <p className="error-box" role="alert">{error?.kind === 'timeout' ? g.timeoutRetry : error?.message}</p>
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
  const rg = GM_STRINGS[locale];

  const h = HDMI_COPY[rl];
  const checkpoint = result.status === 'hdmi_checkpoint';
  const wifiCheckpoint = result.task.type === 'wifi' && result.wifiAdvance === true;
  const wifi = wifiCopy(rl);
  const showWifiMenu = () => {
    photoAttempt.current++;
    lastScreen.current = undefined;
    setPendingScreen(null);
    setScreenError(null);
    setResult({ ...result, status: 'needs_clarification', wifiAdvance: undefined, steps: [], narrationTokens: {}, evidenceRefs: [],
      clarification: { kind: 'screen_photo', question: wifi.photo, controlId: null } });
    setGuideKey(k => k + 1);
  };
  const continuation = result.hdmi;
  const showList = () => {
    if (!continuation) return;
    setAnswers(a => ({ ...a, hdmi: { photoId: continuation.photoId, layoutId: continuation.layoutId, listVisible: true } }));
    setScreenError(null);
    setPhase('input-list');
  };
  const resetList = () => {
    photoAttempt.current++;
    abort.current?.abort();
    setPendingScreen(null);
    lastScreen.current = undefined;
    showList();
  };
  const backToSource = () => {
    photoAttempt.current++;
    setPendingScreen(null);
    lastScreen.current = undefined;
    setScreenError(null);
    if (!continuation) return;
    const next = { ...answers, hdmi: { photoId: continuation.photoId, layoutId: continuation.layoutId } };
    setAnswers(next);
    if (opener.current?.hdmi?.photoId === continuation.photoId) {
      setResult(opener.current); setGuideKey(k => k + 1); setPhase('result');
    } else void generate(next);
  };
  if (continuation && (phase === 'input-list' || (result.status === 'needs_clarification' && continuation.stage === 'select_input'))) {
    const current = phase === 'result' ? result.clarification : null;
    return <InputList key={guideKey} locale={rl} uiLocale={locale} headingRef={headingRef} initialLabels={answers.hdmi?.typedLabels}
      choices={current?.kind === 'choose_input' ? continuation.labels : []} question={current?.question} error={screenError}
      inputs={screenInput()} camera={() => screenRef.current?.click()} gallery={() => screenGallery.current?.click()}
      useLabels={typedLabels => generate({ ...answers, hdmi: { photoId: continuation.photoId, layoutId: continuation.layoutId, listVisible: true, typedLabels } })}
      choose={target => generate({ ...answers, hdmi: { ...answers.hdmi, photoId: continuation.photoId, layoutId: continuation.layoutId, listVisible: true, target } })}
      back={backToSource} />;
  }

  if (result.status === 'ready' || checkpoint) {
    const first = opener.current;
    const familyOpener = continuation && first?.hdmi?.photoId === continuation.photoId && first.hdmi.layoutId === continuation.layoutId ? first : null;
    const narrationById = new Map(result.steps.map((s) => [s.id, s.narration]));
    return (
      <div lang={rl}>
        {!continuation && screenInput()}
        <GuidePlayer
          key={guideKey}
          title={result.task.summary || rg.title}
          subtitle={result.deviceCandidates[0]?.family ?? ''}
          badge={result.demo ? { tone: 'demo', text: GM_STRINGS[rl].demoBadge } : { tone: 'live', text: GM_STRINGS[rl].liveBadge }}
          steps={toPlayerSteps(result)}
          image={{ src: photo.url, width: photo.width, height: photo.height, alt: GM_STRINGS[rl].photoTitle, frameWidth: '100%' }}
          locale={rl}
          onConfirmLast={checkpoint ? showList : wifiCheckpoint ? showWifiMenu : undefined}
          autoNarration={!result.demo}
          labels={checkpoint ? { yes: h.sawList, no: h.didNot, retry: STRINGS[rl].showButton } : wifiCheckpoint ? { yes: wifi.saw, no: GM_STRINGS[rl].screenNo } : { no: GM_STRINGS[rl].screenNo }}
          controls={result.observedControls.filter(c => c.display === 'box').map(c => c.bbox)}
          speak={health?.speech && !health.demo && languages[rl].tts ? (step) => speakUrl(rl, narrationById.get(step.id) ?? step.instruction, result.narrationTokens[step.id] ?? '') : undefined}
          mismatchExtra={checkpoint ? () => <button className="btn btn-secondary" onClick={() => {
            const source = result.steps[0].controlId;
            opener.current = null;
            setResult({ ...result, status: 'needs_clarification', steps: [], narrationTokens: {},
              hdmi: { ...continuation!, stage: 'resolve_source' }, clarification: { kind: 'confirm_button', controlId: source, question: h.sourceConfirm } });
            setGuideKey(k => k + 1);
          }}>{h.mark}</button> : continuation ? () =>
            <button className="btn btn-secondary" onClick={resetList}>{h.listTitle}</button> : wifiCheckpoint ? () =>
            <button className="btn btn-secondary" onClick={showWifiMenu}>{wifi.skip}</button> : result.task.type === 'wifi' ? undefined : (step) => (
            <button
              type="button" lang={locale}
              className="btn btn-secondary"
              onClick={() => {
                screenAnswers.current = { mismatch: { stepId: step.id, expected: step.expected.slice(0, 300) } };
                screenRef.current?.click();
              }}
            >
              {rg.screenPhoto}
            </button>
          )}
          footer={
            <div lang={locale}>
              {checkpoint && <button className="btn btn-secondary wide" lang={rl} onClick={showList}>{h.already}</button>}
              {wifiCheckpoint && <button className="btn btn-secondary wide" lang={rl} onClick={showWifiMenu}>{wifi.skip}</button>}
              {result.evidenceRefs.length > 0 && (
                <p className="evidence">
                  {rg.basedOn}: {result.evidenceRefs.map((r) => r.title).join(' · ')}
                </p>
              )}
              <button type="button" className="btn btn-secondary wide" onClick={startOver}>↺ {rg.startOver}</button>
              {onFamily && !checkpoint && result.task.type !== 'wifi' && (!continuation || familyOpener) && <button type="button" className="btn btn-secondary wide"
                onClick={() => {
                  const full = familyOpener
                    ? { ...result, steps: [...familyOpener.steps, ...result.steps], narrationTokens: { ...familyOpener.narrationTokens, ...result.narrationTokens } }
                    : result;
                  onFamily({ source: 'session', result: full, photo });
                }}>{FAMILY[locale].create}</button>}
            </div>
          }
        />
      </div>
    );
  }

  if (result.status === 'unsupported' || result.status === 'advice') {
    return (
      <main className="flow" lang={locale}>
        <FlowHeading icon="camera" title={result.status === 'advice' ? rg.adviceTitle : rg.unsupportedTitle} headingRef={headingRef} />
        {result.demo && <p className="badge badge-demo">⚠ {rg.demoBadge}</p>}
        <p className={result.status === 'advice' ? 'question' : 'warn-box'} role="alert" lang={rl}>{result.advice ?? result.unsupportedReason}</p>
        <div className="stack">
          <button type="button" className="btn btn-primary" onClick={() => { lastScreen.current = undefined; setAnswers({}); setPhase('task'); }}>← {rg.taskTitle}</button>
          <button type="button" className="btn btn-secondary" onClick={startOver}>↺ {rg.startOver}</button>
        </div>
      </main>
    );
  }

  return (
    <Clarify
      key={guideKey}
      result={result}
      locale={locale}
      photo={photo}
      headingRef={headingRef}
      screenInput={result.clarification?.kind === 'screen_photo' ? screenInput() : null}
      replacements={<><PhotoInputs onFile={onPhoto} camRef={camRef} galRef={galRef} />
        <button className="btn btn-secondary" onClick={() => camRef.current?.click()}>{h.retake}</button>
        <button className="btn btn-secondary" onClick={() => galRef.current?.click()}>{h.another}</button></>}
      skip={continuation && result.clarification?.kind !== 'clearer_photo' ? showList : undefined}
      onScreenPhoto={() => { screenAnswers.current = {}; screenRef.current?.click(); }}
      onScreenGallery={() => { screenAnswers.current = {}; screenGallery.current?.click(); }}
      onEditRequest={() => { lastScreen.current = undefined; opener.current = null; setPendingScreen(null); setAnswers({}); setPhase('task'); }}
      onAnswer={a => {
        const replaced = new Set(a.userControls?.map(c => c.id));
        const rejected = new Set([...(answers.rejectedControlIds ?? []), ...(a.rejectedControlIds ?? [])]);
        const confirmed = [...(answers.confirmedControlIds ?? []).filter(id => !rejected.has(id)), ...(a.confirmedControlIds ?? [])];
        void generate({ ...answers, ...a, hdmi: continuation ? { photoId: continuation.photoId, layoutId: continuation.layoutId } : undefined,
          confirmedControlIds: [...new Set(confirmed)], rejectedControlIds: [...rejected],
          textOnlyControlIds: [...new Set([...(answers.textOnlyControlIds ?? []), ...(a.textOnlyControlIds ?? [])])],
          userControls: [...(answers.userControls ?? []).filter(c => !replaced.has(c.id)), ...(a.userControls ?? [])] });
      }}
      onStartOver={startOver}
    />
  );
}

function Clarify({ result, locale, photo, headingRef, screenInput, onScreenPhoto, onScreenGallery, onEditRequest, replacements, skip, onAnswer, onStartOver }: {
  result: GuideResult;
  locale: Locale;
  photo: NormalizedPhoto;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  screenInput: React.ReactNode;
  onScreenPhoto: () => void;
  onScreenGallery: () => void;
  onEditRequest: () => void;
  replacements: React.ReactNode;
  skip?: () => void;
  onAnswer: (a: ClarificationAnswers) => void;
  onStartOver: () => void;
}) {
  const g = GM_STRINGS[locale];
  const c = result.clarification!;
  const hdmi = result.hdmi?.stage === 'resolve_source';
  useEffect(() => {
    if (result.task.type === 'wifi' && c.kind === 'screen_photo') headingRef.current?.focus();
  }, [c.kind, headingRef, result.task.type]);
  const h = HDMI_COPY[result.locale];
  const [text, setText] = useState('');
  const [marking, setMarking] = useState(false);
  const [mark, setMark] = useState<BBox | null>(null);
  const control: ObservedControl | undefined = c.controlId ? result.observedControls.find((x) => x.id === c.controlId) : undefined;

  return (
    <main className="flow" lang={locale}>
      <FlowHeading icon="camera" title={g.clarifyTitle} headingRef={headingRef} />
      {result.demo && <p className="badge badge-demo">⚠ {g.demoBadge}</p>}
      <p className="question" role="alert" lang={result.locale}>{c.question}</p>
      {c.photoIssue === 'not_remote' && <p>{g.photoHelp}</p>}
      {screenInput}

      {(hdmi || c.kind === 'clearer_photo') && <>
        <RemoteImage src={photo.url} width={photo.width} height={photo.height} alt={g.photoTitle} frameWidth="100%"
          hotspot={marking ? mark ?? undefined : control?.bbox} ringStyle={marking ? 'mark' : 'guide'}
          hint={marking ? g.tapHint : ''} failedText={g.errUnreadable}
          onTap={marking ? pt => setMark(boxAroundTap(pt, photo)) : undefined} />
        {hdmi && c.kind !== 'clearer_photo' && <div className="stack" lang={result.locale}>
          {!marking && control && <button className="btn btn-primary" onClick={() => onAnswer({ confirmedControlIds: [control.id] })}>{g.yesThatsIt}</button>}
          {!marking ? <button className="btn btn-secondary" onClick={() => setMarking(true)}>{h.mark}</button> :
            <button className="btn btn-primary" disabled={!mark} onClick={() => {
              if (mark) onAnswer({ rejectedControlIds: result.observedControls.filter(b => b.role === 'input').map(b => b.id),
                userControls: [{ id: 'source', role: 'input', label: 'Source/Input', bbox: mark }], confirmedControlIds: ['user_source'] });
            }}>{h.confirmMark}</button>}
          {skip && <button className="btn btn-secondary" onClick={skip}>{h.already}</button>}
        </div>}
        {replacements}
      </>}

      {c.kind === 'screen_photo' && (
        <div className="stack">
          <button type="button" className="btn btn-primary" onClick={onScreenPhoto}>{g.screenPhoto}</button>
          {result.task.type === 'wifi' && <button type="button" className="btn btn-secondary" onClick={onScreenGallery}>{g.gallery}</button>}
        </div>
      )}

      {c.editRequest && <button type="button" className="btn btn-primary" onClick={onEditRequest}>← {g.taskTitle}</button>}
      {!c.editRequest && (c.kind === 'tv_model' || (c.kind === 'screen_photo' && result.task.type !== 'wifi') || c.kind === 'text') && (
        <form className="field" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(c.kind === 'text' ? { note: text.trim() } : { tvModel: text.trim() }); }}>
          <label>
            <span>{c.kind === 'text' ? g.answerLabel : g.tvModelLabel}</span>
            <input type="text" value={text} maxLength={c.kind === 'text' ? 300 : 80} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-secondary" disabled={!text.trim()}>{g.send}</button>
        </form>
      )}

      {!hdmi && c.kind === 'confirm_button' && control && (
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
              {result.task.type !== 'wifi' && <button type="button" className="btn btn-secondary" onClick={() => setMarking(true)}>{g.noMark}</button>}
              {result.task.type === 'wifi' && <button type="button" className="btn btn-secondary" onClick={() => onAnswer({ rejectedControlIds: [control.id] })}>{wifiCopy(result.locale).notButton}</button>}
              {result.task.type !== 'wifi' && <button type="button" className="btn btn-secondary" onClick={() => onAnswer({ textOnlyControlIds: [control.id] })}>{g.textOnly}</button>}
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
              {result.task.type !== 'wifi' && <button type="button" className="btn btn-secondary" onClick={() => onAnswer({ textOnlyControlIds: [control.id] })}>{g.textOnly}</button>}
            </div>
          )}
      {!hdmi && c.kind === 'confirm_button' && replacements}
        </>
      )}

      <button type="button" className="btn btn-secondary wide" onClick={onStartOver}>↺ {g.startOver}</button>
    </main>
  );
}
