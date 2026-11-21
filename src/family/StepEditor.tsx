import type { ReactNode } from 'react';
import { FAMILY_LIMITS, type FamilyGuide, type FamilyStep } from '../../shared/family';
import type { BBox } from '../../shared/guide';
import type { Locale } from '../data/types';
import { RemoteImage } from '../player/RemoteImage';
import { newId } from './draft';
import { FAMILY } from './strings';

export function StepEditor({ guide, step, locale, photoUrl, update, narration }: {
  guide: FamilyGuide; step: FamilyStep; locale: Locale; photoUrl?: string;
  update: (guide: FamilyGuide) => void; narration?: ReactNode;
}) {
  const s = FAMILY[locale];
  const control = guide.controls.find(c => c.id === step.controlId);
  const marksFull = !control && guide.controls.length >= FAMILY_LIMITS.controls;
  const change = (patch: Partial<FamilyStep>) => update({ ...guide, steps: guide.steps.map(item => item.id === step.id ? { ...item, ...patch } : item) });
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
  return <div className="stack step-fields">
    <label className="field">{s.kind}<select aria-label={s.kind} value={step.kind}
      onChange={e => change({ kind: e.target.value as FamilyStep['kind'], controlId: null })}>
      <option value="button">{s.button}</option><option value="checkpoint">{s.checkpoint}</option>
    </select></label>
    {step.kind === 'button' && <>
      <label className="field">{s.mark}<select aria-label={s.mark} value={control?.id ?? ''} onChange={e => change({ controlId: e.target.value || null })}>
        <option value="">{s.newMark}</option>
        {guide.controls.map((c, i) => <option key={c.id} value={c.id}>{c.label || s.button + ' ' + (i + 1)}</option>)}
      </select></label>
      {photoUrl && guide.image ? <>
        <RemoteImage src={photoUrl} {...guide.image} alt={s.remote} hotspot={control?.box} ringStyle="mark"
          failedText={s.errors.image} hint={marksFull ? s.marksFull : s.tap} frameWidth="min(78%, 300px)" onTap={marksFull ? undefined : place} />
        {!control && !marksFull && <button type="button" className="btn btn-secondary" onClick={() => place({ x: 0.5, y: 0.5 })}>{s.centre}</button>}
      </> : <p className="warn-box">{s.errors.image}</p>}
      {control && <>
        <label className="field">{s.name}<input type="text" maxLength={160} value={control.label}
          onChange={e => update({ ...guide, controls: guide.controls.map(c => c === control ? { ...c, label: e.target.value } : c) })} /></label>
        <details><summary>{s.adjust}</summary>
          <p className="muted">{s.sharedMark}</p>
          {(['x', 'y', 'w', 'h'] as const).map((axis, i) => <label className="field" key={axis}>
            {[s.left, s.top, s.width, s.height][i]} · {Math.round(control.box[axis] * 100)}%
            <input type="range" step="0.25" min={i < 2 ? 0 : 0.5}
              max={axis === 'x' ? (1 - control.box.w) * 100 : axis === 'y' ? (1 - control.box.h) * 100 : 100}
              value={control.box[axis] * 100} onChange={e => resize(axis, Number(e.target.value))} />
          </label>)}
        </details>
      </>}
    </>}
    {(['instruction', 'expected', 'recovery', 'screenLabel'] as const).map((k, i) => <label key={k} className="field">
      {[s.action, s.expected, s.recovery, s.label][i]}
      <textarea aria-label={[s.action, s.expected, s.recovery, s.label][i]} lang={guide.locale} rows={k === 'screenLabel' ? 1 : 2} maxLength={[500,400,500,100][i]}
        value={step[k]} onChange={e => change({ [k]: e.target.value })} />
    </label>)}
    {narration}
  </div>;
}
