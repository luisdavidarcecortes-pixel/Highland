import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const candidates = [
  'build/pdf.worker.min.mjs',
  'build/pdf.worker.min.js',
  'legacy/build/pdf.worker.min.mjs',
  'legacy/build/pdf.worker.min.js',
];

for (const c of candidates) {
  const src = join('node_modules', 'pdfjs-dist', c);
  if (existsSync(src)) {
    mkdirSync('public', { recursive: true });
    copyFileSync(src, join('public', 'pdf.worker.min.mjs'));
    console.log('[copy-pdf-worker] copiado', c, '-> public/pdf.worker.min.mjs');
    process.exit(0);
  }
}
console.warn('[copy-pdf-worker] worker de pdfjs-dist no encontrado; ejecuta npm install primero');
