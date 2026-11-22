import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STRINGS } from '../i18n';
import { StepPlayer, type PlayerStep, type StepPlayerProps } from './StepPlayer';

const steps: PlayerStep[] = ['Source', 'HDMI 2'].map((name, i) => ({
  id: String(i), instruction: 'Choose ' + name, expected: name + ' visible', recovery: 'Try again',
}));
const copy = STRINGS.en;
const defaults: StepPlayerProps = {
  title: 'TV guide', subtitle: '', locale: 'en', t: copy, steps,
  image: { src: '/remote.jpg', width: 120, height: 300, alt: 'TV remote' },
};

class AudioStub {
  static items: AudioStub[] = [];
  static blocked = false;
  static requests: string[] = [];
  currentTime = 0;
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) { AudioStub.items.push(this); }
  play() {
    AudioStub.requests.push(this.src);
    if (AudioStub.blocked) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
}
const button = (name: string) => screen.getByRole('button', { name });
const deferred = () => { let finish!: (value: string) => void; const p = new Promise<string>(r => { finish = r; }); return { p, finish }; };

beforeEach(() => {
  localStorage.removeItem('ingane.guide-narration.muted');
  AudioStub.items = [];
  AudioStub.requests = [];
  AudioStub.blocked = false;
  vi.stubGlobal('Audio', AudioStub);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('automatic step narration', () => {
  it('makes one narration request during strict remount, autoplays after each confirmation, and never advances on audio end', async () => {
    const speak = vi.fn(async step => 'blob:' + step.id);
    render(<StrictMode><StepPlayer {...defaults} autoNarration speak={speak} /></StrictMode>);
    await waitFor(() => expect(button(copy.replay)).toBeTruthy());
    expect(speak).toHaveBeenCalledTimes(1);
    const a = AudioStub.items[0];
    act(() => a.onended?.());
    expect(screen.getByText(copy.stepOf(1, 2))).toBeTruthy();
    fireEvent.click(button(copy.yes));
    await waitFor(() => expect(AudioStub.requests).toEqual(['blob:0', 'blob:1']));
    expect(AudioStub.items).toEqual([a]);
    fireEvent.click(button(copy.screenDifferent));
    expect(a.paused).toBe(true);
    expect(screen.getByText(copy.stepOf(2, 2))).toBeTruthy();
    expect(speak).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Choose HDMI 2')).toBeTruthy();
  });

  it('shows Tap to hear and retries cached audio in the user gesture without resynthesizing', async () => {
    AudioStub.blocked = true;
    const speak = vi.fn(async () => 'blob:source');
    render(<StepPlayer {...defaults} autoNarration speak={speak} />);
    await waitFor(() => expect(button('Tap to hear')).toBeTruthy());
    expect(screen.queryByText(copy.audioFailed)).toBeNull();
    AudioStub.blocked = false;
    fireEvent.click(button('Tap to hear'));
    expect(AudioStub.requests).toEqual(['blob:source', 'blob:source']);
    expect(speak).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button(copy.replay)).toBeTruthy());
  });

  it('drops an old pending clip after step changes, and stops immediately when muting', async () => {
    const old = deferred();
    const speak = vi.fn((step: PlayerStep) => step.id === '0' ? old.p : Promise.resolve('blob:new'));
    render(<StepPlayer {...defaults} autoNarration speak={speak} />);
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    fireEvent.click(button(copy.yes));
    await waitFor(() => expect(button(copy.replay)).toBeTruthy());
    await act(async () => old.finish('blob:old'));
    expect(AudioStub.requests).toEqual(['blob:new']);
    fireEvent.click(button('Mute narration'));
    expect(AudioStub.items[0].paused).toBe(true);
    expect(screen.queryByRole('button', { name: copy.play })).toBeNull();
    expect(screen.getByText('Choose HDMI 2')).toBeTruthy();
  });

  it('persists mute for new guide players and keeps shared recordings manual', async () => {
    const speak = vi.fn(async () => 'blob:live');
    const original = render(<StepPlayer {...defaults} autoNarration speak={speak} />);
    await waitFor(() => expect(button(copy.replay)).toBeTruthy());
    fireEvent.click(button('Mute narration'));
    original.unmount();
    speak.mockClear();
    const next = render(<StepPlayer {...defaults} autoNarration speak={speak} />);
    expect(button('Turn narration on')).toBeTruthy();
    expect(speak).not.toHaveBeenCalled();
    next.unmount();
    const loadAudio = vi.fn(async () => 'blob:family');
    render(<StepPlayer {...defaults} steps={steps.map(s => ({ ...s, loadAudio }))} />);
    expect(loadAudio).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Turn narration on' })).toBeNull();
    fireEvent.click(button(copy.play));
    await waitFor(() => expect(button(copy.replay)).toBeTruthy());
    fireEvent.click(button(copy.replay));
    expect(loadAudio).toHaveBeenCalledTimes(2); // shared clips retain the revocation recheck
  });

  it('keeps the text available and the step unchanged when Sarvam is unavailable', async () => {
    const speak = vi.fn(async () => { throw new Error('offline'); });
    render(<StepPlayer {...defaults} autoNarration speak={speak} />);
    expect(await screen.findByText(copy.audioFailed)).toBeTruthy();
    expect(screen.getByText('Choose Source')).toBeTruthy();
    expect(screen.getByText(copy.stepOf(1, 2))).toBeTruthy();
    expect(button(copy.yes)).toBeTruthy();
  });
});
