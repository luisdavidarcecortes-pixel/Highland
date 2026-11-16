import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { expect, it } from 'vitest';

it('prepares every page and searchable text as bounded images in a separate process', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'newspaper-reader-test-'));
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 800]).drawText('First newspaper page');
    pdf.addPage([600, 800]).drawText('Second newspaper page');
    await writeFile(path.join(folder, 'source.pdf'), await pdf.save());
    await promisify(execFile)(process.execPath, [path.resolve('scripts/prepare-reader.mjs'), folder], { windowsHide: true, timeout: 20000 });
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
    expect(manifest.status).toBe('ready'); expect(manifest.numPages).toBe(2);
    expect(manifest.pages.map((page: any) => page.n)).toEqual([1, 2]);
    expect(manifest.pages[1].text).toContain('Second newspaper page');
    const metadata = await sharp(await readFile(path.join(folder, '2.webp'))).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(1400);
    expect(metadata.width! * metadata.height!).toBeLessThanOrEqual(2_805_000);
  } finally {
    if (path.dirname(path.resolve(folder)) === path.resolve(tmpdir()) && path.basename(folder).startsWith('newspaper-reader-test-')) await rm(folder, { recursive: true, force: true });
  }
}, 30000);

it('writes the manifest without rendering the images, and renders one page on its own', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'newspaper-reader-test-'));
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 800]).drawText('First newspaper page');
    pdf.addPage([600, 800]).drawText('Second newspaper page');
    const source = path.join(folder, 'source.pdf');
    await writeFile(source, await pdf.save());

    // The manifest alone: what a serverless function can afford to do.
    const manifestPath = path.join(folder, 'manifest.json');
    await promisify(execFile)(process.execPath, [path.resolve('scripts/prepare-reader.mjs'), 'meta', source, manifestPath], { windowsHide: true, timeout: 20000 });
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(manifest.status).toBe('ready');
    expect(manifest.numPages).toBe(2);
    expect(manifest.pages[0].text).toContain('First newspaper page');
    expect(manifest.pages[0].width).toBeGreaterThan(0);
    // No images are produced in this mode.
    await expect(readFile(path.join(folder, '1.webp'), 'utf8')).rejects.toThrow();

    // And a single page, rendered on request.
    const imagePath = path.join(folder, 'one.webp');
    await promisify(execFile)(process.execPath, [path.resolve('scripts/prepare-reader.mjs'), 'page', source, '2', imagePath], { windowsHide: true, timeout: 20000 });
    const metadata = await sharp(await readFile(imagePath)).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeLessThanOrEqual(1400);
  } finally {
    if (path.dirname(path.resolve(folder)) === path.resolve(tmpdir()) && path.basename(folder).startsWith('newspaper-reader-test-')) await rm(folder, { recursive: true, force: true });
  }
}, 30000);
