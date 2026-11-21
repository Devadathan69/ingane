import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audioReady, FAMILY_LIMITS, type FamilyGuide, type FamilyIssue, type FamilyStep } from '../../shared/family';
import { guideLanguages, languages, type GuideLanguage } from '../../shared/languages';
import type { Locale } from '../data/types';
import { normalizePhoto } from '../guideme/photo';
import { newStep, type DraftChange, type FamilyDraft } from './draft';
import { useBlobUrl } from './FamilyPlayer';
import { StepEditor } from './StepEditor';
import { FAMILY } from './strings';
import { FlowHeading, Icon } from '../ui/Icon';

export function Editor({ draft, locale, update, issues, onPreview, onSave, onList, busy, notice, review, narration, sharing }: {
  draft: FamilyDraft; locale: Locale; update: (d: DraftChange) => void; issues: FamilyIssue[]; review: boolean;
  busy: boolean; notice: string; onPreview: () => void; onSave: () => void; onList: () => void;
  narration?: (s: FamilyStep) => ReactNode; sharing?: ReactNode;
}) {
  const g = draft.guide, s = FAMILY[locale];
  const [selected, select] = useState<string | undefined>(g.steps[0]?.id);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [replacement, setReplacement] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const photoUrl = useBlobUrl(draft.photo);
  const change = (guide: FamilyGuide) => update({ ...draft, guide });
  const focusIssue = (issue: FamilyIssue) => {
    const step = issue.step ? g.steps[issue.step - 1] : undefined;
    if (step) select(step.id);
    const field = issue.field ?? issue.code;
    const id = step ? 'family-' + step.id + '-' + field :
      'family-' + (field === 'steps' ? 'add' : field);
    requestAnimationFrame(() => {
      const element = document.getElementById(id) ?? document.getElementById('family-issues');
      if (!element) return;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      element.focus();
    });
  };
  useEffect(() => { if (issues[0]) focusIssue(issues[0]); }, [issues]);
  const staleClips = g.steps.some(step => draft.clips[step.id] && !audioReady(step, g.locale));
  const upload = async (image: File) => {
    setPhotoBusy(true); setPhotoError(false);
    try {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(image.type) &&
          (image.type || !/\.(jpe?g|png|webp|hei[cf])$/i.test(image.name))) throw new Error('photo_type');
      const bytes = new Uint8Array(await image.slice(0, 32).arrayBuffer());
      const header = String.fromCharCode(...bytes);
      if (!(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) && !header.startsWith('\x89PNG\r\n\x1a\n') &&
          !(header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') &&
          !(header.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(header.slice(8)))) throw new Error('photo_type');
      const p = await normalizePhoto(image);
      URL.revokeObjectURL(p.url);
      if (p.blob.size > FAMILY_LIMITS.imageBytes) throw new Error('photo_size');
      update(current => ({ ...current, photo: p.blob, guide: { ...current.guide, image: { width: p.width, height: p.height }, controls: [],
        steps: current.guide.steps.map(step => ({ ...step, controlId: null })) } }));
    } catch { setPhotoError(true); } finally { setPhotoBusy(false); }
  };
  const move = (i: number, by: number) => {
    const steps = [...g.steps];
    [steps[i], steps[i + by]] = [steps[i + by], steps[i]];
    change({ ...g, steps });
  };
  const remove = (step: FamilyStep, index: number) => {
    const steps = g.steps.filter(t => t.id !== step.id), clips = { ...draft.clips };
    delete clips[step.id];
    if (selected === step.id) select(steps[Math.min(index, steps.length - 1)]?.id);
    update({ ...draft, clips, guide: { ...g, steps } });
  };
  return <main className="flow family"><FlowHeading icon="edit" title={s.newTitle} />
    {g.demo && <span className="badge badge-demo">{s.demo}</span>}
    {review && <p>{s.review}</p>}
    <div className="editor-actions" role="group" aria-label={s.previewShare}>
      <button type="button" className="btn btn-secondary" disabled={busy || photoBusy} onClick={onSave}>{s.save}</button>
      <button type="button" className="btn btn-primary" disabled={busy || photoBusy} onClick={onPreview}>{s.preview}</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {issues.length > 0 && <ul role="alert" tabIndex={-1} id="family-issues" className="warn-box family-issues">{issues.map((issue, i) =>
      <li key={i}><button type="button" onClick={() => focusIssue(issue)}>{issue.step && (issue.step + ' · ')}{s.errors[issue.code]}</button></li>)}</ul>}
    <fieldset disabled={busy || photoBusy} className="family-form stack">
      <section className="flow-panel family-details stack" aria-label={s.details}>
        <h2>{s.details}</h2>
        <label className="field">{s.title}<input id="family-title" aria-invalid={issues.some(i => i.code === 'title')} type="text" maxLength={200} value={g.title} onChange={e => change({ ...g, title: e.target.value })} /></label>
        <label className="field">{s.language}<select aria-label={s.language} aria-describedby="guide-lang-hint" value={g.locale} onChange={e => change({ ...g,
          locale: e.target.value as GuideLanguage, steps: g.steps.map(step => step.audioLocale ? { ...step, audioReview: null } : step) })}>
          {guideLanguages.map(l => <option value={l} lang={l} key={l}>{languages[l].native}</option>)}
        </select></label>
        <p id="guide-lang-hint" className="muted">{s.languageHint}</p>
        <details className="family-extra"><summary>{s.optionalDetails}</summary><div className="stack">
          <label className="field">{s.nickname}<input id="family-nickname" type="text" maxLength={60} value={g.nickname} onChange={e => change({ ...g, nickname: e.target.value })} /></label>
          <label className="field">{s.before}<textarea id="family-before" rows={2} maxLength={500} value={g.before} onChange={e => change({ ...g, before: e.target.value })} /></label>
        </div></details>
        <div className="family-photo">
          {photoUrl ? <img src={photoUrl} alt={s.remote} /> : <span className="icon-tile"><Icon name="camera" /></span>}
          <div><p className="muted">{s.photoHelp}</p>
            <input ref={file} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-testid="family-photo"
              onChange={e => { const picked = e.target.files?.[0]; e.target.value = ''; if (picked) { if (draft.photo || g.controls.length) setReplacement(picked); else void upload(picked); } }} />
            <button id="family-image" type="button" className="btn btn-secondary" onClick={() => file.current?.click()}>{draft.photo ? s.replacePhoto : s.newPhoto}</button>
          </div>
        </div>
        {replacement && <div className="warn-box stack" role="group"><p>{s.replaceWarning}</p>
          <button className="btn btn-secondary" onClick={() => setReplacement(null)}>{s.keepPhoto}</button>
          <button className="btn btn-primary" onClick={() => { void upload(replacement); setReplacement(null); }}>{s.confirmPhoto}</button></div>}
        {photoError && <p role="alert" className="warn-box">{s.errors.image}</p>}
      </section>
      <h2 className="steps-heading">{s.steps}</h2>
      {g.steps.map((step, i) => <section key={step.id} className="family-step" aria-label={s.choose + ' ' + (i + 1)}>
        <button className="step-summary" type="button" aria-expanded={selected === step.id} onClick={() => select(selected === step.id ? undefined : step.id)}>
          <strong>{i + 1}</strong> {step.instruction || s.newStep}
        </button>
        {selected === step.id && <StepEditor guide={g} step={step} update={change} photoUrl={photoUrl} locale={locale} issues={issues.filter(e => e.step === i + 1)} narration={narration?.(step)} />}
        {selected === step.id && <details><summary>{s.stepOptions}</summary><div className="family-order">
          <button className="btn btn-secondary" disabled={!i} onClick={() => move(i, -1)} aria-label={s.up + ' · ' + (i + 1)}>{s.up}</button>
          <button className="btn btn-secondary" disabled={i === g.steps.length - 1} onClick={() => move(i, 1)} aria-label={s.down + ' · ' + (i + 1)}>{s.down}</button>
          <button className="btn btn-secondary" onClick={() => remove(step, i)} aria-label={s.remove + ' · ' + (i + 1)}>{s.remove}</button>
        </div></details>}
      </section>)}
      <button id="family-add" className="btn btn-secondary" disabled={g.steps.length >= FAMILY_LIMITS.steps} onClick={() => {
        const step = newStep(); change({ ...g, steps: [...g.steps, step] }); select(step.id);
      }}>{s.add}</button>
      <h2>{s.previewShare}</h2>
      {staleClips && <p role="status" className="warn-box">{s.stale}</p>}
      {sharing}
      <button className="btn btn-secondary" onClick={onList}>{s.list}</button>
    </fieldset>
  </main>;
}
