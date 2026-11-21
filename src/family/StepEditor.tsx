import type { ReactNode } from 'react';
import { FAMILY_LIMITS, type FamilyGuide, type FamilyIssue, type FamilyStep } from '../../shared/family';
import type { BBox } from '../../shared/guide';
import type { Locale } from '../data/types';
import { RemoteImage } from '../player/RemoteImage';
import { newId } from './draft';
import { FAMILY } from './strings';

export function StepEditor({ guide, step, locale, photoUrl, update, narration, issues }: {
  guide: FamilyGuide; step: FamilyStep; locale: Locale; photoUrl?: string;
  update: (guide: FamilyGuide) => void; narration?: ReactNode; issues: FamilyIssue[];
}) {
  const s = FAMILY[locale];
  const control = guide.controls.find(c => c.id === step.controlId);
  const marksFull = !control && guide.controls.length >= FAMILY_LIMITS.controls;
  const change = (patch: Partial<FamilyStep>) => {
    const changedVoice = (patch.instruction !== undefined && patch.instruction !== step.instruction) ||
      (patch.screenLabel !== undefined && patch.screenLabel !== step.screenLabel);
    update({ ...guide, steps: guide.steps.map(item => item.id === step.id
      ? { ...item, ...patch, ...(changedVoice && item.audioLocale ? { audioReview: null } : {}) } : item) });
  };
  const fieldId = (field: string) => 'family-' + step.id + '-' + field;
  const invalid = (field: string) => issues.some(issue => (issue.field ?? issue.code) === field);
  const mark = (box: BBox) => {
    if (control) update({ ...guide, controls: guide.controls.map(c => c === control ? { ...c, box } : c) });
    else {
      const id = newId();
      update({ ...guide, controls: [...guide.controls, { id, box, label: '' }],
        steps: guide.steps.map(item => item.id === step.id ? { ...item, controlId: id } : item) });
    }
  };
  const place = (pt: { x: number; y: number }) => {
    if (!guide.image || marksFull) return;
    const w = control?.box.w ?? 0.16;
    const h = control?.box.h ?? Math.min(0.2, w * guide.image.width / guide.image.height);
    mark({ x: Math.max(0, Math.min(1 - w, pt.x - w / 2)), y: Math.max(0, Math.min(1 - h, pt.y - h / 2)), w, h });
  };
  const resize = (axis: keyof BBox, percent: number) => {
    if (!control) return;
    const b = { ...control.box, [axis]: percent / 100 };
    b.x = Math.min(b.x, 1 - b.w); b.y = Math.min(b.y, 1 - b.h);
    mark(b);
  };
  const textField = (field: 'instruction' | 'expected' | 'recovery' | 'screenLabel', label: string, maxLength: number) =>
    <label className="field">{label}<textarea id={fieldId(field)} aria-label={label} aria-invalid={invalid(field)} lang={guide.locale} rows={field === 'screenLabel' ? 1 : 2}
      maxLength={maxLength} value={step[field]} onChange={e => change({ [field]: e.target.value })} /></label>;
  return <div className="stack step-fields">
    {textField('instruction', s.action, 500)}
    <label className="field">{s.kind}<select id={fieldId('kind')} aria-label={s.kind} value={step.kind}
      onChange={e => change({ kind: e.target.value as FamilyStep['kind'], controlId: null })}>
      <option value="button">{s.button}</option><option value="checkpoint">{s.checkpoint}</option>
    </select></label>
    {step.kind === 'button' && <>
      <label className="field">{s.mark}<select id={fieldId('control')} aria-label={s.mark} aria-invalid={invalid('control')} value={control?.id ?? ''} onChange={e => change({ controlId: e.target.value || null })}>
        <option value="">{s.newMark}</option>
        {guide.controls.map((c, i) => <option key={c.id} value={c.id}>{c.label || s.button + ' ' + (i + 1)}</option>)}
      </select></label>
      {photoUrl && guide.image ? <>
        <RemoteImage src={photoUrl} {...guide.image} alt={s.remote} hotspot={control?.box} ringStyle="mark"
          failedText={s.errors.image} hint={marksFull ? s.marksFull : s.tap} frameWidth="min(78%, 300px)" onTap={marksFull ? undefined : place} />
        {!control && !marksFull && <button type="button" className="btn btn-secondary" onClick={() => place({ x: 0.5, y: 0.5 })}>{s.centre}</button>}
      </> : <p className="warn-box">{s.errors.image}</p>}
      {control && <>
        <label className="field">{s.name}<input id={fieldId('name')} aria-invalid={invalid('name')} type="text" maxLength={160} value={control.label}
          onChange={e => update({ ...guide, controls: guide.controls.map(c => c === control ? { ...c, label: e.target.value } : c) })} /></label>
        <details><summary>{s.adjust}</summary>
          <p className="muted">{s.sharedMark}</p>
          {(['x', 'y', 'w', 'h'] as const).map((axis, i) => <label className="field" key={axis}>
            {[s.left, s.top, s.width, s.height][i]} · {Math.round(control.box[axis] * 100)}%
            <input id={fieldId('box-' + axis)} aria-invalid={invalid('box-' + axis)} type="range" step="0.25" min={i < 2 ? 0 : 0.5}
              max={axis === 'x' ? (1 - control.box.w) * 100 : axis === 'y' ? (1 - control.box.h) * 100 : 100}
              value={control.box[axis] * 100} onChange={e => resize(axis, Number(e.target.value))} />
          </label>)}
        </details>
      </>}
    </>}
    {textField('expected', s.expected, 400)}
    {textField('recovery', s.recovery, 500)}
    <details><summary>{s.label}</summary>{textField('screenLabel', s.label, 100)}</details>
    <details><summary>{s.audio}</summary>{narration}</details>
  </div>;
}
