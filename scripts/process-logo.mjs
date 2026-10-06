/**
 * Convierte el logo blanco de Highland Academy (sobre foto oscura) en:
 *  1. logo-dark.png  → trazo oscuro (tinta) sobre fondo transparente, para fondos claros
 *  2. logo-white.png → trazo blanco sobre fondo transparente, para fondos oscuros
 * Uso: node scripts/process-logo.mjs
 */
import { Jimp, intToRGBA } from 'jimp';
import { mkdirSync } from 'node:fs';

const SRC = 'public/brand/logo-original.png';
mkdirSync('public/brand', { recursive: true });

const img = await Jimp.read(SRC);
const { width, height } = img.bitmap;
console.log('Original:', width, 'x', height);

// El logo es blanco brillante sobre un fondo oscuro (foto del techo).
// Rampa suave: brillo 140→0 (fondo), 225→255 (logo); bordes anti-aliased suaves.
const LO = 140;
const HI = 225;

// 1) Máscara del logo + autorecorte al contenido
const mask = img.clone();
let minX = width, minY = height, maxX = 0, maxY = 0;
mask.scan(0, 0, width, height, function (x, y, idx) {
  const r = this.bitmap.data[idx];
  const g = this.bitmap.data[idx + 1];
  const b = this.bitmap.data[idx + 2];
  const bright = (r + g + b) / 3;
  const alpha = Math.max(0, Math.min(255, Math.round(((bright - LO) / (HI - LO)) * 255)));
  // Puerta de ruido: elimina la neblina tenue del fondo de la foto
  const clean = alpha < 55 ? 0 : alpha > 210 ? 255 : alpha;
  this.bitmap.data[idx + 3] = clean;
  if (clean > 40) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
});

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
console.log('Recorte:', cropW, 'x', cropH, 'desde', minX, minY);

// 2) Versión oscura (tinta) para fondos claros
const dark = mask.clone().crop({ x: minX, y: minY, w: cropW, h: cropH });
dark.scan(0, 0, cropW, cropH, function (x, y, idx) {
  if (this.bitmap.data[idx + 3] > 0) {
    this.bitmap.data[idx] = 51;     // #333333 (project dark gray)
    this.bitmap.data[idx + 1] = 51;
    this.bitmap.data[idx + 2] = 51;
  }
});
await dark.write('public/brand/logo-dark.png');

// 3) Versión blanca para fondos oscuros
const white = mask.clone().crop({ x: minX, y: minY, w: cropW, h: cropH });
white.scan(0, 0, cropW, cropH, function (x, y, idx) {
  if (this.bitmap.data[idx + 3] > 0) {
    this.bitmap.data[idx] = 255;
    this.bitmap.data[idx + 1] = 255;
    this.bitmap.data[idx + 2] = 255;
  }
});
await white.write('public/brand/logo-white.png');

console.log('Generados: logo-dark.png y logo-white.png (favicon aparte, en SVG)');
