import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from '../App';
import { languages, uiLanguages } from '../../shared/languages';
import { presetRegistry } from '../data/presets/registry';
import { tvBrands } from '../data/brand-guides';
import { FAMILY } from '../family/strings';
import { GM_STRINGS } from '../guideme/strings';
import { STRINGS } from '../i18n';
import { BRAND_COPY } from './brand-strings';
import { Library } from './Library';
import { PRESET_STRINGS } from './strings';

afterEach(() => { cleanup(); window.localStorage.clear(); });

const scripts = { hi: /\p{Script=Devanagari}/u, ta: /\p{Script=Tamil}/u, kn: /\p{Script=Kannada}/u, te: /\p{Script=Telugu}/u };

it.each(uiLanguages)('keeps the %s interface across home, search, brand help and reload', locale => {
  window.history.replaceState(null, '', '/?lang=en');
  render(<App />);
  const select = screen.getByRole('combobox', { name: STRINGS.en.interfaceLanguage });
  expect(Array.from((select as HTMLSelectElement).options, o => o.text)).toEqual(uiLanguages.map(l => languages[l].native));
  fireEvent.change(select, { target: { value: locale } });
  expect(screen.getByRole('heading', { name: STRINGS[locale].chooseTitle })).toBeTruthy();
  expect(document.documentElement.lang).toBe(locale);
  expect(window.localStorage.getItem('ingane.lang')).toBe(locale);
  const href = screen.getByRole('link', { name: 'TCL' }).getAttribute('href')!;
  cleanup();
  window.history.replaceState(null, '', href);
  render(<App />);
  expect(screen.getByRole('heading', { name: 'TCL' })).toBeTruthy();
  const summaries = Array.from(document.querySelectorAll('details.brand-resource summary'));
  expect(summaries.map(el => el.textContent)).toEqual([BRAND_COPY[locale].hdmi + 'Home · Input', BRAND_COPY[locale].sound]);
  expect(screen.getByRole('link', { name: PRESET_STRINGS[locale].photo }).getAttribute('href')).toContain('lang=' + locale);
  expect(screen.queryByText('DEMO-TV-01')).toBeNull();
  cleanup();
  window.history.replaceState(null, '', '/');
  render(<App />);
  expect(screen.getByRole('combobox', { name: STRINGS[locale].interfaceLanguage })).toHaveProperty('value', locale);
});

it.each(tvBrands)('offers only the documented guides and official sources for $name', brand => {
  render(<Library locale="en" brandId={brand.id} />);
  expect(screen.getByRole('heading', { name: brand.name })).toBeTruthy();
  expect(Array.from(document.querySelectorAll<HTMLAnchorElement>('a.manufacturer-source'), a => a.href)).toEqual(brand.guides.map(g => g.source));
  for (const [i, guide] of brand.guides.entries()) {
    const article = document.querySelectorAll('details.brand-resource')[i];
    expect(article.querySelector('strong')?.textContent).toBe(BRAND_COPY.en[guide.title]);
    expect(article.querySelectorAll('li')).toHaveLength(guide.steps.length);
    expect(article.querySelector('img')).toBeNull();
  }
});

it('finds brands by name and task, excludes research and keeps an unknown model out', () => {
  render(<Library locale="hi" />);
  const query = screen.getByRole('searchbox');
  const matches = () => Array.from(document.querySelectorAll('.brand-tile strong'), el => el.textContent);
  expect(matches()).toEqual(tvBrands.map(b => b.name));
  fireEvent.change(query, { target: { value: ' tCl ' } });
  expect(matches()).toEqual(['TCL']);
  fireEvent.change(query, { target: { value: BRAND_COPY.hi.sound } });
  expect(matches()).toEqual(['TCL']);
  fireEvent.change(query, { target: { value: 'TCL-UNKNOWN-123' } });
  expect(matches()).toEqual([]);
  expect(screen.getByRole('status').textContent).toBe(PRESET_STRINGS.hi.noResults);
  expect(screen.queryByText('DEMO-R01')).toBeNull();
});

it.each(Object.entries(scripts))('uses the %s script on the major surfaces and the sharing consent screen', (key, script) => {
  const locale = key as keyof typeof scripts;
  const [ui, photo, family, preset] = [STRINGS[locale], GM_STRINGS[locale], FAMILY[locale], PRESET_STRINGS[locale]];
  for (const label of [ui.chooseTitle, photo.consentBody, family.warning, family.errors.secret, family.signIn,
    preset.available, ui.unknownBody('bad-link'), ui.stepOf(1, 2), photo.recording(10)]) expect(label).toMatch(script);
});

it('opens an available tested task for the chosen brand only after the pictured layout is confirmed', () => {
  const registry = structuredClone(presetRegistry);
  const evidence = { status: 'device-verified' as const, verifiedOn: '2025-01-12' };
  const remote = registry.remotes[0];
  registry.remotes = [{ ...remote, ...evidence, brand: 'TCL', asset: { ...remote.asset!, usage: 'catalog', rights: 'Test fixture' } }];
  registry.tvs = [{ ...registry.tvs[0], ...evidence, brand: 'TCL', modelCode: 'TEST-TV' }];
  registry.guides = registry.guides.map(g => ({ ...g, ...evidence }));
  render(<Library registry={registry} brandId="tcl" locale="en" />);
  expect(screen.getByRole('heading', { name: BRAND_COPY.en.verified })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Switch to HDMI.*TEST-TV/ }));
  expect(screen.getByRole('heading', { name: PRESET_STRINGS.en.remote })).toBeTruthy();
  expect(screen.queryByLabelText('Task')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /My remote matches/ }));
  expect(screen.getByLabelText('Task')).toHaveProperty('value', 'demo-hdmi');
  expect(screen.getByRole('button', { name: 'Start guide' })).toHaveProperty('disabled', true);
});
