import { describe, expect, it } from 'vitest';
import { progressReducer, START, type ProgressAction } from './progress';

const run = (total: number, actions: ProgressAction['type'][]) =>
  actions.reduce((s, type) => progressReducer(total)(s, { type } as ProgressAction), START);

describe('progressReducer', () => {
  it('advances only on confirm', () => {
    expect(run(3, ['confirm']).index).toBe(1);
    expect(run(3, ['mismatch', 'mismatch'])).toMatchObject({ index: 0, mismatch: true, done: false });
  });
  it('wrong screen never advances, even if confirm is sent while recovering', () => {
    expect(run(3, ['mismatch', 'confirm'])).toMatchObject({ index: 0, mismatch: true });
    expect(run(3, ['mismatch', 'retry', 'confirm'])).toMatchObject({ index: 1, mismatch: false });
  });
  it('shows success only after the final confirmation', () => {
    expect(run(2, ['confirm']).done).toBe(false);
    expect(run(2, ['confirm', 'confirm']).done).toBe(true);
    expect(run(2, ['confirm', 'confirm', 'confirm'])).toMatchObject({ index: 1, done: true });
  });
  it('back and restart', () => {
    expect(run(3, ['back']).index).toBe(0);
    expect(run(3, ['confirm', 'confirm', 'back']).index).toBe(1);
    expect(run(2, ['confirm', 'confirm', 'back'])).toMatchObject({ index: 1, done: false });
    expect(run(3, ['confirm', 'mismatch', 'restart'])).toEqual(START);
  });
});
