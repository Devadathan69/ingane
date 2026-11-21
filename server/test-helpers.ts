import type { NormalizedImage } from './providers/types';

/** Header-only PNG: enough for magic-byte sniffing and dimension checks (mock providers never decode). */
export function fakePng(width = 800, height = 1200, extra = 64): Buffer {
  const b = Buffer.alloc(33 + extra);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

export function fakeImage(width = 800, height = 1200): NormalizedImage {
  return { bytes: fakePng(width, height), mime: 'image/png', width, height };
}

/** Bytes starting with the WebM/EBML magic number. */
export function fakeWebm(): Buffer {
  const b = Buffer.alloc(256);
  Buffer.from('1a45dfa3', 'hex').copy(b, 0);
  return b;
}
