// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GuideResult, type ClarificationAnswers } from '../shared/guide';
import { createApp } from './app';
import { loadConfig } from './config';
import type { ScreenObservation, VisionControl } from './providers/types';
import { fakePng } from './test-helpers';

const makeControl = (id: string, label: string, role: VisionControl['role'], y: number, confidence: VisionControl['confidence'] = 'high'): VisionControl => ({
  id, label, role, bbox: { x: .2, y, w: .2, h: .08 }, confidence,
});
const normalScreen: ScreenObservation = { isTvScreen: true, isInputList: false, labels: [], summary: '', selectedLabel: null };
const settings = makeControl('settings', 'Settings gear icon', 'settings', .1);
const nav = makeControl('dpad', 'directional ring', 'nav_ring', .4);
const ok = makeControl('ok', 'OK', 'ok', .6);
const remote = new Blob([new Uint8Array(fakePng())], { type: 'image/png' });
const screen = new Blob([new Uint8Array(fakePng(1100, 600))], { type: 'image/png' });

function testApi(controls = [settings, nav, ok]) {
  const config = loadConfig({ INGANE_PROVIDER: 'mock' });
  let shown = normalScreen;
  const analyzeScreen = vi.fn(async () => shown);
  config.guide = { ...config.guide!, analyzeScreen, analyzeRemote: async () => ({ isRemote: true, photoQuality: 'good', controls, deviceCandidates: [] }) };
  const app = createApp({ config });
  const request = async (task = 'connect my TV to Wi-Fi', current?: Partial<ScreenObservation>, answers: ClarificationAnswers = {}, locale = 'en') => {
    if (current) shown = { ...normalScreen, ...current };
    const body = new FormData();
    for (const [key, value] of Object.entries({ consent: 'true', locale, request: task, answers: JSON.stringify(answers) })) body.set(key, value);
    body.set('image', remote, 'remote.png');
    if (current) body.set('screenImage', screen, 'screen.png');
    const response = await app.request('/api/guide', { method: 'POST', body });
    expect(response.status).toBe(200);
    return GuideResult.parse(await response.json());
  };
  return { request, analyzeScreen };
}

describe('Wi-Fi guide through POST /api/guide', () => {
  it('starts from a visible Settings key, then follows only the current UI label and lets the user choose their network on the TV', async () => {
    const { request, analyzeScreen } = testApi();
    const first = await request();
    expect(first).toMatchObject({ status: 'ready', wifiAdvance: true, steps: [{ controlId: 'settings', screenLabel: null }] });
    expect(analyzeScreen).not.toHaveBeenCalled();

    const second = await request(undefined, { labels: ['Network & Internet', 'Apps'] });
    expect(second.status).toBe('ready');
    expect(second.wifiAdvance).toBe(true);
    expect(second.steps.map(s => [s.controlId, s.screenLabel])).toEqual([
      ['dpad', 'Network & Internet'], ['ok', 'Network & Internet'],
    ]);
    expect(second.steps.every(s => s.instruction.includes('Network & Internet'))).toBe(true);
    expect(second.steps.every(s => !s.instruction.includes('Wi-Fi'))).toBe(true);
  });

  it('does not instruct a blind toggle and distinguishes turn on from join', async () => {
    const { request } = testApi();
    const final = await request(undefined, { labels: ['Wi-Fi', 'Do not print this network name'] });
    expect(final.status).toBe('ready');
    expect(final.wifiAdvance).toBeUndefined();
    expect(final.steps[0]).toMatchObject({ controlId: null, screenLabel: 'Wi-Fi', expectedState: expect.stringContaining('connected') });
    expect(final.steps[0].instruction).toMatch(/if it is off.*password only on the TV/i);
    expect(JSON.stringify(final)).not.toContain('Do not print this network name');
    const enable = await request('Turn on Wi-Fi', { labels: ['Wi-Fi'] });
    expect(enable.task.summary).toBe('Turn on TV Wi-Fi');
    expect(enable.steps[0]).toMatchObject({ controlId: null, expectedState: 'The TV shows Wi-Fi is on.' });
    expect(enable.steps[0].instruction).toMatch(/already on, leave it on.*do not need to join/i);
  });

  it('does not fabricate a menu on unknown TVs or re-echo sensitive screens', async () => {
    const { request } = testApi();
    const unknown = await request(undefined, { labels: ['System preferences', 'Connections and Security'] });
    expect(unknown).toMatchObject({ status: 'needs_clarification', clarification: { kind: 'screen_photo' }, steps: [] });
    const credentialScreen = await request(undefined, { wifiSensitive: true, labels: ['Wi-Fi', 'ActualP@55'] });
    expect(credentialScreen).toMatchObject({ status: 'advice', steps: [] });
    expect(JSON.stringify(credentialScreen)).not.toContain('ActualP@55');
    expect(credentialScreen.advice).toMatch(/do not send.*QR code/i);
  });

  it('enforces button confirmation and ignores arbitrary marked controls', async () => {
    const { request } = testApi([{ ...settings, confidence: 'medium' }, nav, ok]);
    const first = await request();
    expect(first).toMatchObject({ status: 'needs_clarification', clarification: { kind: 'confirm_button', controlId: 'settings' }, steps: [] });
    const approved = await request(undefined, undefined, { confirmedControlIds: ['settings'] });
    expect(approved).toMatchObject({ status: 'ready', steps: [{ controlId: 'settings' }] });
    const rejected = await request(undefined, undefined, { rejectedControlIds: ['settings'],
      userControls: [{ id: 'replacement', role: 'settings', label: 'settings gear', bbox: settings.bbox }] });
    expect(rejected).toMatchObject({ status: 'needs_clarification', clarification: { kind: 'screen_photo' }, steps: [] });
  });
});
