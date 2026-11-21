import { useEffect, useRef, useState } from 'react';
import { languages } from '../../shared/languages';
import { familyIssues, makeFamilySnapshot, type FamilyIssue, type FamilyStep } from '../../shared/family';
import type { Locale } from '../data/types';
import { blankDraft, draftFromSeed, type DraftChange, type FamilyDraft, type FamilySeed } from './draft';
import { Editor } from './Editor';
import { FamilyPlayer } from './FamilyPlayer';
import { deleteDraft, listDrafts, saveDraft } from './storage';
import { FAMILY } from './strings';
import './family.css';
import { SharePanel, useFamilySharing } from './Sharing';
import { GuideNarration, Narration } from './Narration';
import { FlowHeading, Icon } from '../ui/Icon';

export function FamilyGuides({ locale, seed }: { locale: Locale; seed: FamilySeed | null }) {
  const s = FAMILY[locale];
  const sharing = useFamilySharing(locale);
  const [draft, setDraft] = useState<FamilyDraft | null>(null);
  const current = useRef(draft);
  current.current = draft;
  const [items, setItems] = useState<FamilyDraft[]>([]);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(!!seed);
  const [issues, setIssues] = useState<FamilyIssue[]>([]);
  const [notice, setNotice] = useState('');
  const [remove, setRemove] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [review, setReview] = useState(false);
  const [narrating, setNarrating] = useState(false);
  useEffect(() => {
    let active = true;
    listDrafts().then(rows => { if (active) setItems(rows); }).catch(() => { if (active) setNotice(s.failed); });
    if (seed) draftFromSeed(seed).then(d => {
      if (active) { setDraft(d); setDirty(true); setReview(true); }
    }).catch(() => { if (active) setNotice(s.failed); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [seed]); // A UI language switch must preserve unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const open = (d: FamilyDraft) => { setDraft(d); setDirty(!d.revision); setReview(false); setIssues([]); setNotice(''); setRemove(''); };
  const update = (change: DraftChange) => {
    setDraft(prev => typeof change === 'function' ? (prev && change(prev)) : change);
    setDirty(true); setIssues([]); setNotice('');
  };
  const list = () => {
    setDraft(null); setDirty(false); setLeaving(false); setNotice('');
    listDrafts().then(setItems).catch(() => setNotice(s.failed));
  };
  const save = async () => {
    if (!draft) return;
    const errors = familyIssues(draft.guide, !!draft.photo, false);
    setIssues(errors);
    if (errors.length) return;
    setBusy(true);
    try {
      const next = await saveDraft(draft);
      setDraft(prev => prev === draft ? next : prev?.id === next.id ? { ...prev, revision: next.revision, updatedAt: next.updatedAt } : prev);
      setItems(prev => [next, ...prev.filter(d => d.id !== next.id)]);
      if (current.current === draft) { setDirty(false); setReview(false); setNotice(s.saved); }
    } catch (err) { setNotice(err instanceof Error && err.message === 'conflict' ? s.conflict : s.failed); }
    finally { setBusy(false); }
  };
  const acceptClip = (step: FamilyStep, blob: Blob | null, keepExisting = false) => {
    if (!draft) return;
    const language = draft.guide.locale;
    setDraft(prev => {
      const target = prev?.guide.steps.find(s => s.id === step.id);
      if (!prev || prev.id !== draft.id || prev.guide.locale !== language || !target || (keepExisting && prev.clips[step.id]) ||
          target.instruction !== step.instruction || target.screenLabel !== step.screenLabel) return prev;
      const clips = { ...prev.clips };
      if (blob) clips[step.id] = blob; else delete clips[step.id];
      return { ...prev, clips, guide: { ...prev.guide, steps: prev.guide.steps.map(s =>
        s.id === step.id ? { ...s, audioLocale: blob ? language : null, audioReview: blob ? { instruction: s.instruction, screenLabel: s.screenLabel } : null } : s) } };
    });
    setDirty(true); setNotice('');
  };
  if (preview && draft?.photo) return <FamilyPlayer snapshot={makeFamilySnapshot(draft.guide, true)} photo={draft.photo}
    audio={async id => draft.clips[id]} footer={<button lang={locale} className="btn btn-secondary wide" onClick={() => setPreview(false)}>{s.backEdit}</button>} />;
  if (draft) return <>
    <Editor draft={draft} locale={locale} update={update} issues={issues} notice={notice} busy={busy} review={review}
      narration={step => <Narration key={JSON.stringify([step.id, draft.guide.locale, step.instruction, step.screenLabel])} step={step} locale={locale} language={draft.guide.locale}
        clip={draft.clips[step.id]} accessKey={sharing.key} live={sharing.caps.sarvam && languages[draft.guide.locale].tts} onClip={blob => acceptClip(step,blob)} />}
      sharing={<SharePanel model={sharing} draft={draft} locale={locale} narrating={narrating}
        narration={sharing.caps.sarvam && languages[draft.guide.locale].tts && <GuideNarration key={draft.id + draft.guide.locale}
          draft={draft} locale={locale} accessKey={sharing.key} onClip={(step,blob) => acceptClip(step,blob,true)} setWorking={setNarrating} />}
        validate={() => {
        const errors = familyIssues(draft.guide, !!draft.photo); setIssues(errors); return !errors.length;
      }} />}
      onSave={() => void save()} onList={() => dirty ? setLeaving(true) : list()} onPreview={() => {
        const errors = familyIssues(draft.guide, !!draft.photo); setIssues(errors); if (!errors.length) setPreview(true);
      }} />
    {leaving && <div className="recovery family-leave" role="group"><strong>{s.dirty}</strong>
      <button className="btn btn-secondary" onClick={list}>{s.leave}</button><button className="btn btn-secondary" onClick={() => setLeaving(false)}>{s.cancel}</button></div>}
  </>;
  return <main className="flow family">
    <FlowHeading icon="family" title={s.hub} description={s.local} />
    <div className="family-starts">
      <a className="btn btn-primary" href={`?flow=remote&lang=${locale}`}><Icon name="camera" />{s.fromAI}</a>
      <a className="btn btn-secondary" href={`?flow=presets&lang=${locale}`}><Icon name="library" />{s.fromPreset}</a>
      <button className="btn btn-secondary" disabled={busy} onClick={() => open(blankDraft(locale))}><Icon name="camera" />{s.manual}</button>
    </div>
    <section className="stack draft-shelf" aria-label={s.drafts}><h2>{s.drafts}</h2>
      {busy && <p role="status">{s.wait}</p>}
      {!busy && !items.length && <p className="empty-drafts"><Icon name="file" />{s.empty}</p>}
      {items.map(item => <section className="family-step stack" key={item.id}>
        <h2>{item.guide.title || s.untitled}</h2>
        <button className="btn btn-secondary" onClick={() => open(item)}>{s.edit}</button>
        {remove === item.id ? <><p>{s.confirmDelete}</p><button className="btn btn-secondary" onClick={async () => {
          try { await deleteDraft(item); setItems(prev => prev.filter(d => d.id !== item.id)); setRemove(''); }
          catch { setNotice(s.failed); }
        }}>{s.delete}</button><button className="btn btn-secondary" onClick={() => setRemove('')}>{s.cancel}</button></> :
        <button className="btn btn-secondary" onClick={() => setRemove(item.id)}>{s.delete}</button>}
      </section>)}
    </section>
    {notice && <p role="status">{notice}</p>}
    <SharePanel model={sharing} locale={locale} />
  </main>;
}
