import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { GUIDES } from './data';

const go = (search: string) => window.history.replaceState(null, '', `/${search}`);
const stepHeading = () => screen.getByRole('heading', { level: 2 });
const loadImage = () => {
  const img = document.querySelector('.remote-frame img');
  if (img) fireEvent.load(img);
};

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('App routing', () => {
  it('opens a guide directly from ?guide=', () => {
    go('?guide=practice-hdmi&lang=en');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(GUIDES['practice-hdmi'].title.en);
    expect(stepHeading().textContent).toBe('Step 1 of 4');
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows a helpful error for unknown ids and does not open an unrelated remote', () => {
    go('?guide=home&lang=en');
    render(<App />);
    expect(screen.getByRole('alert').textContent).toMatch(/no guide called “home”/);
    expect(screen.queryByText('Step 1 of 4')).toBeNull();
    expect(screen.getAllByRole('link', { name: /HDMI 2/ })).toHaveLength(1);
  });

  it('defaults to Malayalam', () => {
    go('?guide=practice-hdmi');
    render(<App />);
    expect(document.documentElement.lang).toBe('ml');
    expect(stepHeading().textContent).toBe('ഘട്ടം 1 / 4');
    expect(screen.getByRole('button', { name: /ഇങ്ങനെ തന്നെ/ })).toBeTruthy();
  });
});

describe('Player flow', () => {
  it('runs back, mismatch, retry, restart and success', async () => {
    const user = userEvent.setup();
    go('?guide=practice-hdmi&lang=en');
    render(<App />);
    loadImage();
    expect(screen.getByTestId('hotspot').getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.button-name')?.textContent).toMatch(/SOURCE/);
    expect(document.querySelector('[aria-live]')?.textContent).toMatch(/Step 1 of 4/);

    await user.click(screen.getByRole('button', { name: /I see it/ }));
    expect(stepHeading().textContent).toBe('Step 2 of 4');
    expect(document.activeElement).toBe(stepHeading());

    await user.click(screen.getByRole('button', { name: /Looks different/ }));
    expect(stepHeading().textContent).toBe('Step 2 of 4');
    expect(screen.queryByRole('button', { name: /I see it/ })).toBeNull();
    expect(screen.getByText(GUIDES['practice-hdmi'].steps[1].recovery.en)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Try this step again/ }));
    expect(stepHeading().textContent).toBe('Step 2 of 4');

    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(stepHeading().textContent).toBe('Step 1 of 4');

    for (let i = 0; i < 4; i++) {
      expect(screen.queryByText('Done!')).toBeNull();
      await user.click(screen.getByRole('button', { name: /I see it/ }));
    }
    expect(screen.getByRole('heading', { name: 'Done!' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Start over/ }));
    expect(stepHeading().textContent).toBe('Step 1 of 4');
  });

  it('preserves the step when the language changes', async () => {
    const user = userEvent.setup();
    go('?guide=practice-hdmi&lang=en');
    render(<App />);
    await user.click(screen.getByRole('button', { name: /I see it/ }));
    await user.click(screen.getByRole('button', { name: /I see it/ }));
    await user.click(screen.getByRole('button', { name: 'മലയാളം' }));
    expect(stepHeading().textContent).toBe('ഘട്ടം 3 / 4');
    expect(document.documentElement.lang).toBe('ml');
    expect(window.location.search).toContain('guide=practice-hdmi');
    expect(window.localStorage.getItem('ingane.lang')).toBe('ml');
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    go('?guide=practice-hdmi&lang=en');
    render(<App />);
    screen.getByRole('button', { name: /I see it/ }).focus();
    await user.keyboard('{Enter}');
    expect(stepHeading().textContent).toBe('Step 2 of 4');
    await user.tab();
    expect(document.activeElement?.className).toContain('remote-viewport');
    await user.tab();
    expect(document.activeElement?.textContent).toMatch(/I see it/);
    await user.keyboard(' ');
    expect(stepHeading().textContent).toBe('Step 3 of 4');
  });
});
