import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GuideResult } from '../../shared/guide';
import { STRINGS } from '../i18n';
import { hotspotStyle } from '../player/RemoteImage';
import { StepPlayer } from '../player/StepPlayer';
import { boxAroundTap, GuideMe, toPlayerSteps } from './GuideMe';
import { GM_STRINGS } from './strings';

vi.mock('./photo', async (orig) => ({
  ...(await orig<typeof import('./photo')>()),
  normalizePhoto: vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }), url: 'blob:photo', width: 600, height: 800, sharpness: 500 })),
}));

const result = (over: Partial<GuideResult> = {}): GuideResult => ({
  status: 'ready',
  task: { type: 'restore_sound', summary: 'Restore sound' },
  locale: 'en',
  deviceCandidates: [{ family: 'Demo remote', confidence: 'medium', basis: 'demo' }],
  observedControls: [
    { id: 'mute', label: 'crossed-out speaker icon', role: 'mute', bbox: { x: 0.4, y: 0.3, w: 0.16, h: 0.05 }, confidence: 'high', source: 'vision', display: 'box' },
    { id: 'ok', label: 'OK', role: 'ok', bbox: { x: 0.4, y: 0.5, w: 0.2, h: 0.08 }, confidence: 'high', source: 'vision', display: 'text_only' },
  ],
  evidenceRefs: [{ id: 'generic-sound', title: 'Generic sound', kind: 'generic' }],
  steps: [
    { id: 's1', controlId: 'mute', screenLabel: null, instruction: 'Press Mute once.', narration: 'Press Mute once.', expectedState: 'Sound comes back.', mismatchRecovery: 'Point at the TV and press once more.' },
    { id: 's2', controlId: 'ok', screenLabel: 'HDMI 1', instruction: 'Press OK to choose HDMI 1.', narration: 'Press OK to choose HDMI 1.', expectedState: 'HDMI 1 picture shows.', mismatchRecovery: 'Go back one step.' },
  ],
  clarification: null,
  unsupportedReason: null,
  narrationTokens: { s1: 't1', s2: 't2' },
  image: { width: 600, height: 800 },
  demo: true,
  ...over,
});

class FakeAudio {
  static instances: FakeAudio[] = [];
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('V2 adapters', () => {
  it('uses instructions alone for an uncertain control or a control ID with two candidate boxes', () => {
    const input = result();
    input.observedControls[0].confidence = 'medium';
    expect(toPlayerSteps(input)[0].hotspot).toBeUndefined();
    input.observedControls[0].confidence = 'high';
    input.observedControls.push({ ...input.observedControls[0], bbox: { x: .1, y: .1, w: .2, h: .1 } });
    expect(toPlayerSteps(input)[0]).toMatchObject({ instruction: 'Press Mute once.', hotspot: undefined });
  });
  it('maps controls to hotspots, never boxing text-only controls, and keeps exact screen labels', () => {
    const steps = toPlayerSteps(result());
    expect(steps[0].hotspot).toEqual({ x: 0.4, y: 0.3, w: 0.16, h: 0.05 });
    expect(steps[1].hotspot).toBeUndefined();
    expect(steps[1].button).toBe('OK → HDMI 1');
  });

  it('keeps tap-to-mark boxes inside the image', () => {
    for (const pt of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }]) {
      const b = boxAroundTap(pt, { width: 600, height: 800 });
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(1);
      expect(b.y + b.h).toBeLessThanOrEqual(1);
    }
    const b = boxAroundTap({ x: 0.5, y: 0.5 }, { width: 600, height: 800 });
    expect(b.w * 600).toBeCloseTo(b.h * 800); // square on screen
  });

  it('positions the overlay in percentages of the rendered image', () => {
    expect(hotspotStyle({ x: 0.25, y: 0.1, w: 0.5, h: 0.05 })).toEqual({ left: '25%', top: '10%', width: '50%', height: '5%' });
  });
});

describe('StepPlayer with narration', () => {
  it('plays on tap, offers replay, and stops audio on navigation', async () => {
    const user = userEvent.setup();
    const speak = vi.fn(async () => 'blob:audio');
    render(
      <StepPlayer title="t" subtitle="" badge={{ tone: 'demo', text: 'Demo' }} steps={toPlayerSteps(result())} image={{ src: 'blob:photo', width: 600, height: 800, alt: 'remote' }} locale="en" t={STRINGS.en} labels={{ no: 'My screen looks different' }} speak={speak} />,
    );
    await user.click(screen.getByRole('button', { name: /Play/ }));
    expect(speak).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: /Replay/ })).toBeTruthy());
    const a = FakeAudio.instances[0];
    expect(a.paused).toBe(false);
    await user.click(screen.getByRole('button', { name: /I see it/ }));
    expect(a.paused).toBe(true);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Step 2 of 2');
  });

  it('wrong screen never advances and stays usable when audio fails', async () => {
    const user = userEvent.setup();
    render(
      <StepPlayer title="t" subtitle="" badge={{ tone: 'demo', text: 'Demo' }} steps={toPlayerSteps(result())} image={{ src: 'blob:photo', width: 600, height: 800, alt: 'remote' }} locale="en" t={STRINGS.en} labels={{ no: 'My screen looks different' }} speak={() => Promise.reject(new Error('offline'))} />,
    );
    await user.click(screen.getByRole('button', { name: /Play/ }));
    await waitFor(() => expect(screen.getByText(STRINGS.en.audioFailed)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /My screen looks different/ }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Step 1 of 2');
    expect(screen.getByText('Point at the TV and press once more.')).toBeTruthy();
  });
});

async function toTaskStep(user: ReturnType<typeof userEvent.setup>, locale: 'en' | 'ml' = 'en') {
  const g = GM_STRINGS[locale];
  const input = screen.getByTestId('gallery-input') as HTMLInputElement;
  await user.upload(input, new File(['x'], 'remote.jpg', { type: 'image/jpeg' }));
  await user.click(await screen.findByRole('button', { name: g.usePhoto }));
  await user.click(await screen.findByRole('checkbox'));
}

describe('GuideMe flow', () => {
  it('explains when the server is not reachable (static V1 host)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    render(<GuideMe locale="en" />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Live guides need the Ingane server/);
  });

  it('can retry a reachable server after photo guidance has been configured', async () => {
    const health = { ok: true, guide: false, speech: false, demo: false };
    vi.stubGlobal('fetch', vi.fn(async () => json(health)));
    render(<GuideMe locale="en" />);
    expect((await screen.findByRole('alert')).textContent).toBe(GM_STRINGS.en.guideUnconfigured);
    expect(screen.getByRole('link', { name: GM_STRINGS.en.readyMade })).toBeTruthy();
    health.guide = true;
    await userEvent.click(screen.getByRole('button', { name: GM_STRINGS.en.tryAgain }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByTestId('camera-input')).toBeTruthy();
  });

  it.each(['en', 'ml'] as const)('supports typed photo guides with only OpenAI configured (%s)', async (locale) => {
    const g = GM_STRINGS[locale];
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    vi.stubGlobal('MediaRecorder', class {});
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'api/health') return json({ ok: true, guide: true, speech: false, demo: false });
      expect(url).toBe('api/guide');
      expect((init?.body as FormData).get('locale')).toBe(locale);
      return json(result({ demo: false, locale }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<GuideMe locale={locale} />);
    await toTaskStep(user, locale);
    expect(screen.getByText(g.consentBody)).toBeTruthy();
    expect(screen.queryByText(g.consentVoice)).toBeNull();
    expect(screen.queryByRole('button', { name: g.holdToTalk })).toBeNull();
    expect(screen.getByText(g.typeOnly)).toBeTruthy();
    await user.type(screen.getByRole('textbox'), 'HOME');
    await user.click(screen.getByRole('button', { name: g.generate }));
    expect(await screen.findByText('Press Mute once.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: STRINGS[locale].play })).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['api/health', 'api/guide']);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('requires consent, then typing works when the microphone is denied', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url.includes('health') ? json({ ok: true, guide: true, speech: true, demo: true }) : json(result())));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('MediaRecorder', class { static isTypeSupported = () => true; });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }) } });
    render(<GuideMe locale="en" />);
    await user.upload(screen.getByTestId('camera-input'), new File(['x'], 'remote.jpg', { type: 'image/jpeg' }));
    await user.click(await screen.findByRole('button', { name: 'Use this photo' }));
    await user.type(screen.getByRole('textbox'), 'HOME');
    expect((screen.getByRole('button', { name: 'Make my guide' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['api/health']);
    await user.clear(screen.getByRole('textbox'));
    await user.click(screen.getByRole('checkbox'));
    await user.keyboard('{Tab}');
    screen.getByRole('button', { name: /Hold to talk/ }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/Microphone is blocked/)).toBeTruthy();
    await user.type(screen.getByRole('textbox'), 'TV il sound illa');
    await user.click(screen.getByRole('button', { name: 'Make my guide' }));
    expect(await screen.findByText('Press Mute once.')).toBeTruthy();
    expect(screen.getByText(/Demo data — not live inference/)).toBeTruthy();
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('api/guide'))!;
    const fd = (call[1] as RequestInit).body as FormData;
    expect(fd.get('consent')).toBe('true');
    expect(fd.get('request')).toBe('TV il sound illa');
  });

  it('shows a clarification instead of a guide, and sends the confirmation back', async () => {
    const user = userEvent.setup();
    const clar = result({ status: 'needs_clarification', steps: [], narrationTokens: {}, evidenceRefs: [], clarification: { kind: 'confirm_button', question: 'Is the outlined button the “OK” button?', controlId: 'mute' } });
    const bodies: FormData[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('health')) return json({ ok: true, guide: true, speech: true, demo: true });
      bodies.push(init!.body as FormData);
      return json(bodies.length === 1 ? clar : result());
    }));
    render(<GuideMe locale="en" />);
    await toTaskStep(user);
    await user.type(screen.getByRole('textbox'), 'switch to HDMI');
    await user.click(screen.getByRole('button', { name: 'Make my guide' }));
    expect(await screen.findByText(/Is the outlined button/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /I see it/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Yes, that’s the button/ }));
    await screen.findByText('Press Mute once.');
    expect(JSON.parse(bodies[1].get('answers') as string).confirmedControlIds).toEqual(['mute']);
  });

  it.each(['service', 'gateway'])('retries a %s timeout with the same photo and request', async source => {
    const user = userEvent.setup();
    const attempts: FormData[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('health')) return json({ ok: true, guide: true, speech: true, demo: false });
      attempts.push(init?.body as FormData);
      if (attempts.length > 1) return json(result());
      return source === 'service' ? json({ error: 'timeout' }, 504) : new Response('Timed out', { status: 504 });
    }));
    render(<GuideMe locale="en" />);
    await toTaskStep(user);
    await user.type(screen.getByRole('textbox'), 'no sound');
    await user.click(screen.getByRole('button', { name: 'Make my guide' }));
    await screen.findByRole('heading', { name: 'The guide took too long' });
    expect(screen.getByRole('alert').textContent).toContain('Your photo and request are still here');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Press Mute once.');
    expect(attempts).toHaveLength(2);
    for (const sent of attempts) {
      expect(sent.get('request')).toBe('no sound');
      expect(sent.get('consent')).toBe('true');
      expect(sent.get('image')).toMatchObject({ type: 'image/jpeg', size: 1 });
    }
  });
});
