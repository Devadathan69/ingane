import { readFileSync } from 'node:fs';
import { buildGuide, VisionCache } from './guide';
import { checkImage } from './media';
import { createMockGuideProviders } from './providers/mock';
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

/** Local-only: the file is provided to an in-process observation stub, never posted to a provider. */
export function practicePhotoFixture(): NormalizedImage {
  const checked = checkImage(readFileSync('public/devices/coolux-practice.jpg'));
  if (!checked.ok) throw Error(checked.code);
  return checked.image;
}

export function darkRemoteHdmiOpener() {
  const providers = createMockGuideProviders();
  const observe = providers.analyzeRemote;
  providers.analyzeRemote = async (...args) => {
    const obs = await observe(...args);
    return { ...obs, photoQuality: 'too_dark', controls: obs.controls.map(c =>
      c.role === 'input' ? { ...c, label: 'SOURCE', confidence: 'high' as const } : c) };
  };
  return buildGuide({ image: practicePhotoFixture(), locale: 'ml', request: 'HDMI 2', answers: {} },
    { providers, secret: 'offline-test', cache: new VisionCache(), signal: new AbortController().signal });
}
