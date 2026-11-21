// Only generated pixels enter photo-flow browser tests. No personal fixtures are read.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function makeTestPhotos(browser, dir) {
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  try {
    for (const [file, variant] of [['remote.jpg','remote'], ['blur.jpg','blur'], ['rotated.jpg','rotated'],
      ['landscape.jpg','landscape'], ['tv.jpg','tv']]) {
      const data = await page.evaluate(variant => {
        const canvas = document.createElement('canvas');
        const wide = variant === 'landscape' || variant === 'tv';
        canvas.width = wide ? 960 : 214;
        canvas.height = wide ? 540 : 760;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#27312e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (variant !== 'blur') {
          ctx.fillStyle = '#f4f1de';
          if (variant === 'tv') {
            ctx.font = 'bold 54px sans-serif';
            ['TV', 'HDMI 1', 'HDMI 2', 'AV'].forEach((label, i) => ctx.fillText(label, 70, 90 + i * 105));
          } else {
            ctx.strokeStyle = '#efefef';
            for (let y = 28; y < canvas.height - 18; y += 42) {
              for (let x = 18; x < canvas.width - 30; x += 58) ctx.strokeRect(x, y, 36, 22);
            }
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText('SOURCE', 69, 547); ctx.fillText('OK', 91, 420);
          }
        }
        if (variant !== 'rotated') return canvas.toDataURL('image/jpeg', .93).split(',')[1];
        const stored = document.createElement('canvas');
        stored.width = canvas.height; stored.height = canvas.width;
        const rotated = stored.getContext('2d'); rotated.translate(0, stored.height); rotated.rotate(-Math.PI / 2); rotated.drawImage(canvas, 0, 0);
        return stored.toDataURL('image/jpeg', .93).split(',')[1];
      }, variant);
      let bytes = Buffer.from(data, 'base64');
      if (variant === 'rotated') {
        // Little-endian TIFF, one Orientation=6 entry in an APP1 Exif segment.
        const exif = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000', 'hex');
        bytes = Buffer.concat([bytes.subarray(0, 2), exif, bytes.subarray(2)]);
      }
      writeFileSync(join(dir, file), bytes);
    }
    writeFileSync(join(dir, 'photo.heic'), 'unsupported HEIC test');
    writeFileSync(join(dir, 'notes.txt'), 'test text');
  } finally { await page.close(); }
}
