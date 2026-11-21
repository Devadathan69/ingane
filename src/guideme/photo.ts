/**
 * Client-side normalization: apply EXIF orientation, resize, re-encode as JPEG (which drops all
 * metadata). The returned blob is what we send to the server AND what the player shows, so the
 * vision boxes and the rendered overlay share one coordinate space.
 */
export interface NormalizedPhoto {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  /** Variance of the Laplacian on a small grayscale copy; low means blurry. */
  sharpness: number;
}

export type PhotoErrorCode = 'not_image' | 'heic' | 'unreadable' | 'too_big' | 'too_small';

export class PhotoError extends Error {
  constructor(public readonly code: PhotoErrorCode) {
    super(code);
  }
}

export const PHOTO_LIMITS = { maxInputBytes: 25 * 1024 * 1024, maxSide: 1600, minSide: 200, quality: 0.85 };
/** Calibrated in scripts/e2e-v2.mjs using sharp and blurred remote photographs. */
export const BLUR_THRESHOLD = 60;

const isHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img>, which can decode HEIC on Safari */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function sharpnessOf(src: CanvasImageSource, w: number, h: number): number {
  const scale = Math.min(1, 320 / Math.max(w, h));
  const sw = Math.max(3, Math.round(w * scale));
  const sh = Math.max(3, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Infinity;
  ctx.drawImage(src, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return laplacianVariance(gray, sw, sh);
}

export async function normalizePhoto(file: File): Promise<NormalizedPhoto> {
  if (file.size > PHOTO_LIMITS.maxInputBytes) throw new PhotoError('too_big');
  if (file.type && !file.type.startsWith('image/')) throw new PhotoError('not_image');
  let src: Awaited<ReturnType<typeof decode>>;
  try {
    src = await decode(file);
  } catch {
    throw new PhotoError(isHeic(file) ? 'heic' : file.type ? 'unreadable' : 'not_image');
  }
  const scale = Math.min(1, PHOTO_LIMITS.maxSide / Math.max(src.width, src.height));
  const width = Math.round(src.width * scale);
  const height = Math.round(src.height * scale);
  if (Math.min(width, height) < PHOTO_LIMITS.minSide) throw new PhotoError('too_small');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('unreadable');
  ctx.drawImage(src, 0, 0, width, height);
  if ('close' in src && typeof src.close === 'function') src.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', PHOTO_LIMITS.quality));
  if (!blob) throw new PhotoError('unreadable');
  return { blob, url: URL.createObjectURL(blob), width, height, sharpness: sharpnessOf(canvas, width, height) };
}
