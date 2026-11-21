import type { NormalizedImage } from './providers/types';
import { MEDIA_LIMITS } from '../shared/media';

export const LIMITS = {
  ...MEDIA_LIMITS,
  requestChars: 500,
  ttsChars: 600,
};

function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webpSize(b: Buffer): { width: number; height: number } | null {
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export type ImageCheck = { ok: true; image: NormalizedImage } | { ok: false; code: 'image_type' | 'image_size' | 'image_unreadable' | 'image_dimensions' };

/** Sniffs magic bytes; never trusts the declared content type or file name. */
export function checkImage(bytes: Buffer): ImageCheck {
  if (bytes.length > LIMITS.imageBytes) return { ok: false, code: 'image_size' };
  if (bytes.length < 32) return { ok: false, code: 'image_unreadable' };
  let mime: NormalizedImage['mime'];
  let size: { width: number; height: number } | null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { mime = 'image/jpeg'; size = jpegSize(bytes); }
  else if (bytes.toString('hex', 0, 8) === '89504e470d0a1a0a') { mime = 'image/png'; size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; }
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') { mime = 'image/webp'; size = webpSize(bytes); }
  else return { ok: false, code: 'image_type' };
  if (!size || !size.width || !size.height) return { ok: false, code: 'image_unreadable' };
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  if (short < LIMITS.imageMinSide || long > LIMITS.imageMaxSide) return { ok: false, code: 'image_dimensions' };
  return { ok: true, image: { bytes, mime, ...size } };
}

export type AudioCheck = { ok: true; mime: string } | { ok: false; code: 'audio_type' | 'audio_size' };

export function checkAudio(bytes: Buffer): AudioCheck {
  if (bytes.length > LIMITS.audioBytes) return { ok: false, code: 'audio_size' };
  if (bytes.length < 16) return { ok: false, code: 'audio_type' };
  const hex4 = bytes.toString('hex', 0, 4);
  const asc = (a: number, b: number) => bytes.toString('ascii', a, b);
  if (hex4 === '1a45dfa3') return { ok: true, mime: 'audio/webm' };
  if (asc(0, 4) === 'OggS') return { ok: true, mime: 'audio/ogg' };
  if (asc(4, 8) === 'ftyp') return { ok: true, mime: 'audio/mp4' };
  if (asc(0, 4) === 'RIFF' && asc(8, 12) === 'WAVE') return { ok: true, mime: 'audio/wav' };
  if (asc(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { ok: true, mime: 'audio/mpeg' };
  return { ok: false, code: 'audio_type' };
}
