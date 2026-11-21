import { describe, expect, it } from 'vitest';
import { DEVICES, GUIDES, lookupGuide } from '.';
import { validateGuide, validateHotspot } from './validate';
import type { Guide } from './types';

describe('fixtures', () => {
  it.each(Object.keys(GUIDES))('%s is valid', (id) => {
    expect(validateGuide(GUIDES[id], DEVICES)).toEqual([]);
  });

  it('seeds sample content as unverified', () => {
    for (const g of Object.values(GUIDES)) expect(g.verification).toBe('unverified');
  });

  it('uses the public photograph and the matching marked control for each practice task', () => {
    const hdmi = GUIDES['practice-hdmi'];
    const mute = GUIDES['practice-unmute'];
    expect(hdmi.steps[0].button.en).toContain('SOURCE');
    expect(mute.steps[0].button.en).toContain('MUTE');
    expect(hdmi.steps[0].image).toBe(DEVICES[hdmi.deviceId].image);
    expect(mute.steps[0].image).toBe(DEVICES[mute.deviceId].image);
    expect(hdmi.steps[0].hotspot).not.toEqual(mute.steps[0].hotspot);
  });
});

describe('validateHotspot', () => {
  it('accepts an in-bounds box', () => {
    expect(validateHotspot({ x: 0, y: 0, w: 1, h: 1 }, 't')).toEqual([]);
  });
  it.each([
    [{ x: NaN, y: 0, w: 0.1, h: 0.1 }],
    [{ x: Infinity, y: 0, w: 0.1, h: 0.1 }],
    [{ x: -0.1, y: 0, w: 0.1, h: 0.1 }],
    [{ x: 0, y: 1.2, w: 0.1, h: 0.1 }],
    [{ x: 0, y: 0, w: 0, h: 0.1 }],
    [{ x: 0.5, y: 0, w: 0.6, h: 0.1 }],
    [{ x: 0, y: 0.95, w: 0.1, h: 0.1 }],
  ])('rejects %j', (h) => {
    expect(validateHotspot(h, 't').length).toBeGreaterThan(0);
  });
});

describe('validateGuide', () => {
  const base = GUIDES['practice-hdmi'];
  it('requires both ml and en copy', () => {
    const g: Guide = structuredClone(base);
    g.steps[0].instruction.ml = '  ';
    expect(validateGuide(g, DEVICES).join()).toMatch(/instruction\.ml: required/);
  });
  it('rejects unknown devices and duplicate step ids', () => {
    const g: Guide = structuredClone(base);
    g.deviceId = 'nope';
    g.steps[1].id = g.steps[0].id;
    const errs = validateGuide(g, DEVICES).join();
    expect(errs).toMatch(/unknown deviceId/);
    expect(errs).toMatch(/duplicate step id/);
  });
});

describe('lookupGuide', () => {
  it('finds known guides', () => {
    const r = lookupGuide('practice-unmute');
    expect(r.ok && r.device.id).toBe('coolux-practice');
  });
  it('never falls back for unknown ids', () => {
    expect(lookupGuide('home')).toEqual({ ok: false, reason: 'unknown', id: 'home' });
    expect(lookupGuide('__proto__')).toMatchObject({ ok: false, reason: 'unknown' });
    expect(lookupGuide(null)).toEqual({ ok: false, reason: 'missing' });
  });
});
