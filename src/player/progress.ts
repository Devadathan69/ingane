export interface Progress {
  index: number;
  mismatch: boolean;
  done: boolean;
}

export type ProgressAction =
  | { type: 'confirm' }
  | { type: 'mismatch' }
  | { type: 'retry' }
  | { type: 'back' }
  | { type: 'restart' };

export const START: Progress = { index: 0, mismatch: false, done: false };

/** Pure step machine. Only a positive confirmation ever moves forward. */
export function progressReducer(total: number) {
  return (s: Progress, a: ProgressAction): Progress => {
    switch (a.type) {
      case 'confirm':
        if (s.done || s.mismatch) return s;
        return s.index >= total - 1 ? { ...s, done: true } : { index: s.index + 1, mismatch: false, done: false };
      case 'mismatch':
        return s.done ? s : { ...s, mismatch: true };
      case 'retry':
        return { ...s, mismatch: false };
      case 'back':
        if (s.done) return { ...s, done: false, mismatch: false };
        return { index: Math.max(0, s.index - 1), mismatch: false, done: false };
      case 'restart':
        return START;
    }
  };
}
