// One-off: rebuild the March 2025 issue PDF from the 8 page images (cover already exists).
import { Jimp } from 'jimp';
import { PDFDocument } from 'pdf-lib';
import { mkdirSync, writeFileSync } from 'node:fs';

const SRC_DIR = 'C:/Users/luisd/Downloads/March 2025';
mkdirSync('public/demo/pdfs', { recursive: true });

const A4 = { w: 595.28, h: 841.89 };
const pdf = await PDFDocument.create();
pdf.setTitle('The Highlander — Vol. 3, Issue 5 — 24 March 2025');
pdf.setAuthor('Highland Academy');

for (let n = 1; n <= 8; n++) {
  const img = await Jimp.read(`${SRC_DIR}/${n}.png`);
  const jpeg = await img.getBuffer('image/jpeg', { quality: 88 });
  const embedded = await pdf.embedJpg(jpeg);
  const page = pdf.addPage([A4.w, A4.h]);
  page.drawImage(embedded, { x: 0, y: 0, width: A4.w, height: A4.h });
}

const bytes = await pdf.save();
writeFileSync('public/demo/pdfs/issue-2025-03.pdf', bytes);
console.log(`PDF rebuilt: ${Math.round(bytes.length / 1024)} KB, 8 pages`);
