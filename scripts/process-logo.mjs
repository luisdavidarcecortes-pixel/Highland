/** Extract the white school logo into transparent dark/white variants. */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
const { data, info } = await sharp('public/brand/logo-original.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
let left = width, top = height, right = -1, bottom = -1;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const offset = (y * width + x) * channels;
  const brightness = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
  const alpha = Math.max(0, Math.min(255, Math.round((brightness - 140) / 85 * 255)));
  const clean = alpha < 55 ? 0 : alpha > 210 ? 255 : alpha;
  data[offset + 3] = clean;
  if (clean > 40) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
}
if (right < left) throw new Error('No logo pixels were found.');
mkdirSync('public/brand', { recursive: true });
for (const [name, color] of [['dark', 51], ['white', 255]]) {
  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += channels) { pixels[i] = color; pixels[i + 1] = color; pixels[i + 2] = color; }
  await sharp(pixels, { raw: { width, height, channels } }).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toFile('public/brand/logo-' + name + '.png');
}
console.log('Generated logo-dark.png and logo-white.png');
