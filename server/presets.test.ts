// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { catalogEntries, stepsFor } from '../src/data/presets/catalog';
import { presetRegistry } from '../src/data/presets/registry';
import { validatePresetRegistry } from '../src/data/presets/validate';
import { createApp } from './app';
import { loadConfig } from './config';
import { checkImage } from './media';
import { draftRegistry } from './preset-drafts';
import { silentWav } from './providers/mock';

describe('versioned preset data', () => {
  it('validates the local photo against its original dimensions and content hash', () => {
    expect(validatePresetRegistry(presetRegistry)).toEqual([]);
    for (const remote of presetRegistry.remotes) {
      const asset = remote.asset!;
      const bytes = readFileSync(new URL(`../public/${asset.src}`, import.meta.url));
      expect(checkImage(bytes)).toMatchObject({ ok: true, image: { width: asset.width, height: asset.height } });
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    }
  });

  it('keeps the documentary candidate and its missing evidence out of both collections', () => {
    expect(validatePresetRegistry(draftRegistry)).toEqual([]);
    expect(draftRegistry.remotes[0].asset).toBeNull();
    expect(draftRegistry.tvs[0].menuVariant).toBeNull();
    expect(draftRegistry.guides).toEqual([]);
    for (const scope of ['device-verified', 'demo'] as const) expect(catalogEntries(draftRegistry, scope)).toEqual([]);
    expect(catalogEntries(presetRegistry, 'device-verified')).toEqual([]);
    const [entry] = catalogEntries(presetRegistry, 'demo');
    expect(entry.guides.map(g => g.task)).toEqual(['switch_hdmi', 'restore_sound']);
    const withDraft = structuredClone(presetRegistry);
    withDraft.guides.push({ ...withDraft.guides[0], id: 'unreleased-hdmi', status: 'draft', verifiedOn: null });
    expect(catalogEntries(withDraft, 'demo')[0].guides.map(g => g.id)).not.toContain('unreleased-hdmi');
  });

  it('joins a verified layout only to tasks authored for the exact TV and menu', () => {
    // In-memory test identities and rights. They are never part of the application registry.
    const fixture = structuredClone(presetRegistry);
    const evidence = { status: 'device-verified' as const, verifiedOn: '2025-01-12' };
    const remote = { ...fixture.remotes[0], ...evidence };
    remote.asset = { ...remote.asset!, usage: 'catalog', rights: 'Test fixture', src: 'devices/fixture.jpg' };
    fixture.remotes = [remote];
    const tv = { ...fixture.tvs[0], ...evidence };
    const alternate = { ...tv, id: 'other-menu', menuVariant: 'Menu B' };
    fixture.tvs = [tv, alternate];
    fixture.guides = [
      { ...fixture.guides[0], ...evidence },
      { ...fixture.guides[1], ...evidence, tvId: alternate.id },
    ];
    expect(validatePresetRegistry(fixture)).toEqual([]);
    const entries = catalogEntries(fixture, 'device-verified');
    expect(entries.map(e => [e.tv.menuVariant, e.remote.id, e.guides.map(g => g.task)])).toEqual([
      ['Menu A', remote.id, ['switch_hdmi']], ['Menu B', remote.id, ['restore_sound']],
    ]);
    expect(catalogEntries(fixture, 'demo')).toEqual([]);
    remote.asset.usage = 'local-demo';
    expect(validatePresetRegistry(fixture).join(' ')).toContain('photo rights');
    expect(catalogEntries(fixture, 'device-verified')).toEqual([]);
  });

  it('rejects duplicate IDs, unresolved sources, controls, routes, invalid boxes and missing translations', () => {
    const bad = structuredClone(presetRegistry);
    bad.sources.push(bad.sources[0]);
    bad.remotes[0].sourceIds = ['unknown-photo'];
    bad.remotes[0].controls.mute.hotspot = { x: 0.99, y: 0, w: 0.1, h: 0.1 };
    bad.tvs[0].remoteIds = ['another-layout'];
    const guide = bad.guides[0];
    guide.steps[1].id = guide.steps[0].id;
    guide.steps[0].narration.ml = ' ';
    guide.steps[0].controlId = 'missing-button';
    if (guide.input.kind === 'hdmi-port') guide.input.routes['HDMI 2'] = ['unknown-step'];
    const issues = validatePresetRegistry(bad).join('\n');
    for (const fragment of ['duplicate ID', 'unknown-photo', 'x+w exceeds', 'another-layout', 'incompatible',
      'narration.ml', 'missing-button', 'unknown-step']) expect(issues).toContain(fragment);
    expect(catalogEntries(bad, 'demo')).toEqual([]);
  });

  it('requires an actual verification date and matching evidence for promotion', () => {
    const bad = structuredClone(presetRegistry);
    bad.guides[0] = { ...bad.guides[0], status: 'device-verified', verifiedOn: '2025-02-30' };
    expect(validatePresetRegistry(bad).join(' ')).toMatch(/verification date/);
    expect(validatePresetRegistry(bad).join(' ')).toMatch(/matching verification/);
  });

  it('has one authored press per step and uses only the selected HDMI route', () => {
    const [hdmi, mute] = presetRegistry.guides;
    expect(stepsFor(hdmi, null)).toBeUndefined();
    expect(stepsFor(hdmi, 'HDMI 3')).toBeUndefined();
    expect(stepsFor(hdmi, 'HDMI 1')?.map(s => s.controlId)).toEqual(['input', 'down', 'ok']);
    expect(stepsFor(hdmi, 'HDMI 2')?.map(s => s.controlId)).toEqual(['input', 'down', 'down', 'ok']);
    expect(stepsFor(mute, null)?.map(s => [s.controlId, s.gesture])).toEqual([['mute', 'press']]);
    expect(stepsFor(mute, 'HDMI 1')).toBeUndefined();
  });
});

const selection = { version: 2, scope: 'demo', guideId: 'demo-hdmi', stepId: 'select-input', port: 'HDMI 2' };
const speak = (app: ReturnType<typeof createApp>, body: object) => app.request('/api/speak', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('preset narration', () => {
  it('sends the selected language and authored port through the official Sarvam adapter', async () => {
    // Replace the SDK transport locally. Exercise the live adapter without credentials or network.
    const wav = silentWav();
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({ audios: [wav.toString('base64')] }));
    try {
      const app = createApp({ config: loadConfig({ SARVAM_API_KEY: 'local-test-only' }) });
      for (const locale of ['en', 'ml'] as const) {
        const res = await speak(app, { locale, preset: selection });
        expect(res.status).toBe(200);
        expect(Buffer.from(await res.arrayBuffer())).toEqual(wav);
        const [url, init] = transport.mock.calls.at(-1)!;
        expect(new URL(String(url)).pathname).toBe('/text-to-speech');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          language_code: `${locale}-IN`,
          text: presetRegistry.guides[0].steps.at(-1)!.narration[locale].replace('{port}', 'HDMI 2'),
        });
      }
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      transport.mockRestore();
    }
  });

  it('speaks the authored text in both locales with the guide provider disconnected and caches replay', async () => {
    const config = loadConfig({ INGANE_PROVIDER: 'mock' });
    config.guide = null;
    const speech = vi.spyOn(config.speech!, 'synthesize');
    const app = createApp({ config });
    for (const locale of ['ml', 'en'] as const) {
      const body = { locale, preset: selection };
      const res = await speak(app, body);
      expect(res.headers.get('content-type')).toBe('audio/wav');
      expect(Buffer.from(await res.arrayBuffer()).toString('ascii', 0, 4)).toBe('RIFF');
      const step = presetRegistry.guides[0].steps.at(-1)!;
      expect(speech).toHaveBeenLastCalledWith(step.narration[locale].replace('{port}', 'HDMI 2'), locale, expect.any(AbortSignal));
      expect((await speak(app, body)).status).toBe(200);
    }
    expect(speech).toHaveBeenCalledTimes(2);
  });

  it('rejects stale versions, wrong collections, unknown steps, unrelated ports and client-supplied speech', async () => {
    const app = createApp({ config: loadConfig({ INGANE_PROVIDER: 'mock' }) });
    for (const changes of [
      { version: 0 }, { scope: 'device-verified' }, { scope: 'draft' }, { guideId: 'samsung-in-qa55q60daulxl' },
      { stepId: 'bogus' }, { port: null }, { port: 'my own speech' }, { port: 'HDMI 1', stepId: 'focus-second' },
      { guideId: 'demo-unmute', stepId: 'unmute', port: 'HDMI 2' },
    ]) expect((await speak(app, { locale: 'en', preset: { ...selection, ...changes } })).status).toBe(403);
    expect((await speak(app, { locale: 'en', preset: selection, text: 'my own speech' })).status).toBe(403);
    expect((await speak(app, { locale: 'zz', preset: selection })).status).toBe(403);
  });
});
