import { FAMILY_LIMITS } from '../../shared/family';
import { checkAudio, checkImage } from '../media';

/** The browser sends an oriented JPEG. Strip APP and comment segments, including between progressive scans. */
export function privatePhoto(bytes: Buffer, size: { width: number; height: number }): Buffer | undefined {
  const checked = checkImage(bytes);
  if (!checked.ok || checked.image.mime !== 'image/jpeg' || checked.image.width !== size.width || checked.image.height !== size.height) return;
  const chunks = [bytes.subarray(0, 2)];
  let pos = 2, scanned = false;
  while (pos + 1 < bytes.length) {
    const start = pos;
    if (bytes[pos++] !== 0xff) return;
    while (bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0xd9) return scanned ? Buffer.concat([...chunks, bytes.subarray(pos - 2, pos)]) : undefined;
    if (pos + 2 > bytes.length) return;
    const length = bytes.readUInt16BE(pos);
    if (length < 2 || pos + length > bytes.length) return;
    pos += length;
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) chunks.push(bytes.subarray(start, pos));
    if (marker === 0xda) {
      const entropy = pos;
      while (pos < bytes.length) {
        const ff = bytes.indexOf(0xff, pos);
        if (ff < 0) return;
        const next = bytes[ff + 1];
        if (next !== 0 && !(next >= 0xd0 && next <= 0xd7)) { pos = ff; break; }
        pos = ff + 2;
      }
      if (pos <= entropy) return;
      chunks.push(bytes.subarray(entropy, pos)); scanned = true;
    }
  }
}

/** Canonical mono PCM16 WAV, with no optional metadata chunks. Duration is measured from samples. */
export function privateAudio(b: Buffer) {
  if (!checkAudio(b).ok || b.length <= 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
      b.readUInt32LE(4) !== b.length - 8 || b.readUInt32LE(16) !== 16 || b.readUInt16LE(20) !== 1 ||
      b.readUInt16LE(22) !== 1 || b.readUInt16LE(32) !== 2 || b.readUInt16LE(34) !== 16 || b.toString('ascii', 36, 40) !== 'data') return false;
  const rate = b.readUInt32LE(24), samples = b.readUInt32LE(40);
  return rate >= 8000 && rate <= 48000 && b.readUInt32LE(28) === 2 * rate && samples === b.length - 44 &&
    samples % 2 === 0 && samples <= FAMILY_LIMITS.seconds * rate * 2;
}
