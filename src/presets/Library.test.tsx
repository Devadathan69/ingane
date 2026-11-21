import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { DEVICES } from '../data/devices';
import { catalogEntries } from '../data/presets/catalog';
import { presetRegistry } from '../data/presets/registry';
import * as api from '../guideme/api';
import { STRINGS } from '../i18n';
import { Library } from './Library';
import { PresetPlayer } from './PresetPlayer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const exists = (name: string | RegExp) => screen.queryByRole('button', { name });
const mountApp = (flow = 'presets') => {
  window.history.replaceState(null, '', `/?flow=${flow}&lang=en`);
  render(<App />);
};

describe('ready-made guide selection', () => {
  it('offers both entries on the home page and opens the verified collection first', async () => {
    const user = userEvent.setup();
    mountApp('');
    expect(screen.getByRole('link', { name: 'Ready-made guides' }).getAttribute('href')).toBe('?flow=presets&lang=en');
    expect(screen.getByRole('button', { name: 'Take a photo of your remote' })).toBeTruthy();
    cleanup();
    mountApp();
    expect(screen.getByRole('link', { name: /^TCL/ }).getAttribute('href')).toBe('?flow=presets&brand=tcl&lang=en');
    expect(exists('Ingane Demo')).toBeNull();
    const search = screen.getByRole('searchbox');
    for (const code of ['QA55Q60DAULXL', 'BN59-01500G', 'DEMO-TV-01']) {
      fireEvent.change(search, { target: { value: code } });
      expect(screen.getByRole('status').textContent).toContain('No confirmed match');
      expect(screen.queryByRole('img')).toBeNull();
    }
    expect(screen.getByRole('link', { name: 'Use my remote photo' }).getAttribute('href')).toBe('?flow=remote&lang=en');
    await user.click(button('Try the demo'));
    expect(button('Ingane Demo')).toBeTruthy();
    await user.click(button('Leave demo'));
    expect(exists('Ingane Demo')).toBeNull();
  });

  it('browses an exact model, requires layout confirmation and a port, and pauses on mismatch', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mountApp();
    await user.click(button('Try the demo'));
    await user.click(button('Ingane Demo'));
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'DEMO-TV-01X' } });
    expect(exists(/DEMO-TV-01/)).toBeNull();
    fireEvent.change(search, { target: { value: ' demo-tv-01 ' } });
    await user.click(button(/DEMO-TV-01/));
    expect(screen.getByText(/battery compartment/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Task' })).toBeNull();
    await user.click(button(/My remote matches/));
    await user.selectOptions(screen.getByLabelText('Task'), 'demo-hdmi');
    expect((button('Start guide') as HTMLButtonElement).disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText(/Which HDMI port/), 'HDMI 2');
    await user.click(button('Start guide'));
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByText(/external device is on and connected to HDMI 2/)).toBeTruthy();
    await user.click(button('I see the input list'));
    await user.click(button('My screen looks different'));
    expect(exists('I see HDMI 1 highlighted')).toBeNull();
    expect(screen.getByRole('link', { name: 'Use my remote photo' }).getAttribute('href')).toContain('flow=remote');
    await user.click(button('Try this step again'));
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    await user.click(button('My screen looks different'));
    await user.click(button('Recheck my TV model'));
    expect(screen.getByRole('heading', { name: 'Choose your TV model' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Task' })).toBeNull();
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['api/health']);
  });

  it.each(['DEMO-R01', 'muted sound', 'ശബ്ദം'])('finds a model via %s without skipping remote confirmation', async query => {
    const user = userEvent.setup();
    mountApp();
    await user.click(button('Try the demo'));
    await user.type(screen.getByRole('searchbox'), query);
    await user.click(button(/DEMO-TV-01/));
    expect(screen.getByRole('heading', { name: 'Confirm your remote' })).toBeTruthy();
    await user.click(button(/My remote matches/));
    const task = screen.getByLabelText('Task') as HTMLSelectElement;
    expect(task.value).toBe(query === 'DEMO-R01' ? '' : 'demo-unmute');
  });

  it('requires an explicit pictured layout even when two variants share a part number', async () => {
    const registry = structuredClone(presetRegistry);
    const alt = { ...DEVICES['coolux-practice'], image: 'devices/variant-test.jpg' };
    const source = { id: 'test-other-photo', title: 'Second local test photo', location: alt.image };
    registry.sources.push(source);
    registry.remotes.push({
      ...registry.remotes[0], id: 'test-other-layout', sourceIds: [source.id],
      layoutVariant: { en: 'Broad grey ring and Mute at upper left', ml: 'വീതിയുള്ള ചാര വളയം, മുകളിൽ ഇടത് വശത്ത് മ്യൂട്ട്' },
      asset: {
        ...registry.remotes[0].asset!, src: alt.image, width: alt.width, height: alt.height, alt: alt.imageAlt,
        sha256: 'a'.repeat(64),
      },
      controls: { topMute: { label: { en: 'Upper-left Mute', ml: 'മുകളിൽ ഇടത്തെ മ്യൂട്ട്' },
        hotspot: { x: .12, y: .08, w: .18, h: .04 } } },
    });
    registry.tvs[0].remoteIds.push('test-other-layout');
    const mute = registry.guides[1];
    registry.guides.push({
      ...mute, id: 'test-other-unmute', remoteId: 'test-other-layout', sourceIds: [source.id, 'demo-menu'],
      steps: [{ ...mute.steps[0], controlId: 'topMute' }],
    });
    const user = userEvent.setup();
    render(<Library registry={registry} locale="en" />);
    await user.click(button('Try the demo'));
    await user.type(screen.getByRole('searchbox'), 'DEMO-R01');
    await user.click(button(/DEMO-TV-01/));
    expect(screen.getByText(/Several layouts fit/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Task' })).toBeNull();
    const pictures = screen.getAllByRole('img');
    expect(pictures).toHaveLength(2);
    fireEvent.error(pictures[0]);
    expect((screen.getAllByRole('button', { name: /My remote matches/ })[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.load(pictures[1]);
    const chosen = screen.getByText(/Broad grey ring/).closest('section')!;
    await user.click(within(chosen).getByRole('button', { name: /My remote matches/ }));
    expect(screen.queryByRole('option', { name: 'Switch to HDMI' })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Task'), 'test-other-unmute');
    await user.click(button('Start guide'));
    expect(screen.getByRole('img').getAttribute('src')).toBe(alt.image);
    expect(screen.getByText('Upper-left Mute')).toBeTruthy();
  });
});

describe('preset player narration', () => {
  const entry = catalogEntries(presetRegistry, 'demo')[0];
  it.each(['en', 'ml'] as const)('keeps %s text and progress usable when a configured speaker fails', async locale => {
    vi.spyOn(api, 'getHealth').mockResolvedValue({ ok: true, guide: false, speech: true, demo: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const user = userEvent.setup();
    const guide = entry.guides[1];
    render(<PresetPlayer entry={entry} guide={guide} port={null} scope="demo" locale={locale} onTasks={vi.fn()} onRecheck={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: STRINGS[locale].play }));
    expect(await screen.findByText(STRINGS[locale].audioFailed)).toBeTruthy();
    expect(screen.getByText(guide.steps[0].instruction[locale])).toBeTruthy();
    await user.click(button(STRINGS[locale].yes));
    expect(screen.getByRole('heading', { name: STRINGS[locale].doneTitle })).toBeTruthy();
  });

  it('ignores a late narration response after the viewer reports a mismatch', async () => {
    vi.spyOn(api, 'getHealth').mockResolvedValue({ ok: true, guide: false, speech: true, demo: false });
    let finish!: (url: string) => void;
    vi.spyOn(api, 'speakPresetUrl').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const audio = vi.fn();
    vi.stubGlobal('Audio', audio);
    const user = userEvent.setup();
    render(<PresetPlayer entry={entry} guide={entry.guides[0]} port="HDMI 1" scope="demo" locale="en"
      onTasks={vi.fn()} onRecheck={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await user.click(button('My screen looks different'));
    await act(async () => finish('blob:late-narration'));
    expect(audio).not.toHaveBeenCalled();
    expect(exists('I see the input list')).toBeNull();
  });

  it.each([null, { ok: true, guide: true, speech: true, demo: true }])('keeps an available text guide independent of live narration', async health => {
    vi.spyOn(api, 'getHealth').mockResolvedValue(health);
    await act(async () => { render(<PresetPlayer entry={entry} guide={entry.guides[0]} port="HDMI 2" scope="demo" locale="en"
      onTasks={vi.fn()} onRecheck={vi.fn()} />); });
    expect(exists('Play')).toBeNull();
    expect(button('I see the input list')).toBeTruthy();
  });
});
