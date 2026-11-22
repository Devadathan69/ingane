import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GuideResult } from '../../shared/guide';
import { wifiCopy } from '../../shared/wifi-copy';
import { GuideMe } from './GuideMe';
import { GM_STRINGS } from './strings';

vi.mock('./photo', async (orig) => ({
  ...(await orig<typeof import('./photo')>()),
  normalizePhoto: vi.fn(async () => ({ blob: new Blob(['test'], { type: 'image/jpeg' }), url: 'blob:photo', width: 600, height: 800, sharpness: 500 })),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('asks for a fresh, reviewed, non-credential screen photo after each Wi-Fi checkpoint', async () => {
  const user = userEvent.setup();
  const copy = wifiCopy('en');
  const g = GM_STRINGS.en;
  const requests: FormData[] = [];
  const settings = { id: 'settings', label: 'Settings', role: 'settings', bbox: { x: .2, y: .1, w: .2, h: .1 }, confidence: 'high', source: 'vision', display: 'box' } as const;
  const opener: GuideResult = {
    status: 'ready', wifiAdvance: true, task: { type: 'wifi', summary: copy.title }, locale: 'en',
    deviceCandidates: [], observedControls: [settings], evidenceRefs: [{ id: 'wifi-open-menu', title: 'Settings key', kind: 'generic' }],
    steps: [{ id: 'wifi-open-menu', instruction: 'Press Settings once.', narration: 'Press Settings once.', controlId: 'settings',
      screenLabel: null, expectedState: copy.opened, mismatchRecovery: copy.photo }],
    clarification: null, unsupportedReason: null, narrationTokens: { 'wifi-open-menu': 'token' },
    image: { width: 600, height: 800 }, demo: true,
  };
  const second: GuideResult = { ...opener, steps: [{ ...opener.steps[0], instruction: 'Select Network & Internet.' }] };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('health')) return Response.json({ ok: true, guide: true, speech: false, demo: true });
    requests.push(init?.body as FormData);
    return Response.json(requests.length === 1 ? opener : second);
  }));
  render(<GuideMe locale="en" />);
  const image = new File(['test'], 'remote.jpg', { type: 'image/jpeg' });
  await user.upload(screen.getByTestId('gallery-input') as HTMLInputElement, image);
  await user.click(await screen.findByRole('button', { name: g.usePhoto }));
  await user.click(await screen.findByRole('checkbox'));
  await user.type(screen.getByRole('textbox'), 'Connect the TV to Wi-Fi');
  await user.click(screen.getByRole('button', { name: g.generate }));
  expect(await screen.findByText('Press Settings once.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: copy.saw }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/QR code or other credentials/i);
  expect(screen.queryByRole('textbox')).toBeNull();

  await user.upload(screen.getByTestId('screen-gallery') as HTMLInputElement, image);
  expect(await screen.findByText(g.screenPreview, { selector: 'h2' })).toBeTruthy();
  expect(requests).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: g.sendScreen }));
  await screen.findByText('Select Network & Internet.');
  expect(requests[1].get('screenImage')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: copy.saw }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/QR code/i);
  expect(requests).toHaveLength(2);
});
