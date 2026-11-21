// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { familyIssues, familySnapshotSchema, makeFamilySnapshot } from '../../shared/family';
import type { GuideResult } from '../../shared/guide';
import { catalogEntries } from '../data/presets/catalog';
import { presetRegistry } from '../data/presets/registry';
import { draftFromSeed } from './draft';

const entry = catalogEntries(presetRegistry, 'demo')[0];
const hdmi = entry.guides.find(g => g.task === 'switch_hdmi')!;
const blob = new Blob(['fixture'], { type: 'image/jpeg' });
afterEach(() => vi.unstubAllGlobals());

describe('family draft sources', () => {
  it('copies the selected Malayalam HDMI route and its boxes without changing the V3 original', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(blob)));
    const original = structuredClone(presetRegistry);
    const d = await draftFromSeed({ source: 'preset', entry, guide: hdmi, port: 'HDMI 2', locale: 'ml' });
    expect(d.photo?.type).toBe('image/jpeg');
    expect(familyIssues(d.guide, !!d.photo)).toEqual([]);
    expect(d.guide.steps).toHaveLength(4);
    expect(d.guide.steps.some(s => s.screenLabel === 'HDMI 2')).toBe(true);
    expect(d.guide.steps[0].instruction).toMatch(/[\u0d00-\u0d7f]/);
    d.guide.steps[0].instruction = 'അമ്മേ, ഇൻപുട്ട് അമർത്തൂ.';
    d.guide.controls[0].box.x = 0;
    expect(presetRegistry).toEqual(original);
    await expect(draftFromSeed({ source: 'preset', entry, guide: hdmi, port: null, locale: 'ml' })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(entry.remote.asset.src);
  });

  it('keeps text and flags the missing photo when a copied image is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const d = await draftFromSeed({ source: 'preset', entry, guide: hdmi, port: 'HDMI 2', locale: 'en' });
    expect(familyIssues(d.guide, !!d.photo)).toEqual([{ code: 'image' }]);
    expect(d.guide.steps[0].instruction).toBeTruthy();
  });

  it('imports a reviewed V2 session using checkpoints for text-only controls and strips session data', async () => {
    const photo = { blob, url: 'blob:session', width: 250, height: 600, sharpness: 60 };
    const result: GuideResult = {
      status: 'ready', locale: 'en', demo: false, task: { type: 'restore_sound', summary: 'Restore sound' },
      image: { width: 250, height: 600 }, clarification: null, unsupportedReason: null, deviceCandidates: [], evidenceRefs: [],
      narrationTokens: { one: 'session-only' }, observedControls: [{ id: 'mute', label: 'Mute', role: 'mute', confidence: 'medium',
        display: 'text_only', source: 'vision', bbox: { x: .1, y: .2, w: .3, h: .1 } }],
      steps: [{ id: 'one', controlId: 'mute', screenLabel: null, instruction: 'Check the mute icon.', narration: 'Listen.',
        expectedState: 'Is the icon gone?', mismatchRecovery: 'Check the starting screen.' }],
    };
    const d = await draftFromSeed({ source: 'session', result, photo });
    expect(d.photo).toBe(blob); expect(d.guide.controls).toEqual([]);
    expect(d.guide.steps[0]).toMatchObject({ kind: 'checkpoint', controlId: null });
    const snapshot = makeFamilySnapshot(d.guide, true);
    expect(familySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.steps[0]).toMatchObject({ hotspot: null, hasAudio: false });
    expect(JSON.stringify(d)).not.toContain('session-only');
    await expect(draftFromSeed({ source: 'session', photo, result: { ...result, status: 'unsupported' } })).rejects.toThrow();
  });
});
