// Runs outside Next's request process so PDF conversion cannot freeze the site.
//
// Three modes:
//   batch <folder>                  renders every page of <folder>/source.pdf
//                                    and writes <folder>/manifest.json (local use)
//   meta  <source> <manifestOut>    writes only the manifest (page count, size and
//                                    text of every page). <source> may be a local
//                                    file or an https URL, which is read with range
//                                    requests so only the needed bytes travel
//   page  <source> <page> <out>     renders a single page as WebP
//
// The page and meta modes are what a serverless host needs: every request
// finishes in seconds instead of rendering the whole issue at once.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [mode, ...args] = process.argv.slice(2);

// The old call style (a folder as first argument) still means "batch".
const command = mode === 'batch' || mode === 'meta' || mode === 'page'
  ? mode
  : path.isAbsolute(mode ?? '')
    ? 'batch'
    : null;
const parameters = command === mode ? args : [mode, ...args].filter(Boolean);

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

async function openDocument(source) {
  const options = { isEvalSupported: false, useSystemFonts: true };
  if (isUrl(source)) {
    options.url = source;
    options.rangeChunkSize = 64 * 1024;
    // Only the byte ranges that are really needed are downloaded.
    options.disableAutoFetch = true;
  } else {
    options.data = new Uint8Array(await readFile(source));
  }
  return getDocument(options).promise;
}

function pageSize(page) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1400 / base.width, Math.sqrt(2_800_000 / (base.width * base.height)));
  const viewport = page.getViewport({ scale });
  return { viewport, width: Math.max(1, Math.ceil(viewport.width)), height: Math.max(1, Math.ceil(viewport.height)) };
}

async function pageText(page) {
  const content = await page.getTextContent();
  return content.items.map(item => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim();
}

async function writeJson(pathname, data) {
  await mkdir(path.dirname(pathname), { recursive: true });
  const temporary = `${pathname}.tmp`;
  await writeFile(temporary, JSON.stringify(data));
  await rename(temporary, pathname);
}

if (command === 'batch') {
  const folder = parameters[0];
  if (!folder || !path.isAbsolute(folder)) throw new Error('Expected a cache folder');
  const manifestFile = path.join(folder, 'manifest.json');
  let manifest = { status: 'preparing', numPages: 0, pages: [] };
  const publish = () => writeJson(manifestFile, manifest);
  let doc;
  try {
    doc = await openDocument(path.join(folder, 'source.pdf'));
    manifest.numPages = doc.numPages;
    await publish();
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { viewport, width, height } = pageSize(page);
      const canvas = createCanvas(width, height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const image = await canvas.encode('webp', 80);
      await writeFile(path.join(folder, `${n}.webp`), image);
      manifest.pages.push({ n, width, height, text: await pageText(page), bytes: image.byteLength });
      await publish();
      page.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }
    manifest.status = 'ready';
    await publish();
  } catch {
    manifest.status = 'failed';
    await publish();
    process.exitCode = 1;
  } finally {
    await doc?.destroy();
  }
} else if (command === 'meta') {
  const [source, out] = parameters;
  if (!source || !out) throw new Error('Expected a source and an output file');
  let doc;
  try {
    doc = await openDocument(source);
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { width, height } = pageSize(page);
      pages.push({ n, width, height, text: await pageText(page), bytes: 0 });
      page.cleanup();
    }
    await writeJson(out, { status: 'ready', numPages: doc.numPages, pages });
  } finally {
    await doc?.destroy();
  }
} else if (command === 'page') {
  const [source, number, out] = parameters;
  if (!source || !number || !out) throw new Error('Expected a source, a page number and an output file');
  const wanted = Number(number);
  let doc;
  try {
    doc = await openDocument(source);
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > doc.numPages) throw new Error('Page out of range');
    const page = await doc.getPage(wanted);
    const { viewport, width, height } = pageSize(page);
    const canvas = createCanvas(width, height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const image = await canvas.encode('webp', 80);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, image);
    canvas.width = 1;
    canvas.height = 1;
    page.cleanup();
  } finally {
    await doc?.destroy();
  }
} else {
  throw new Error('Expected the mode: batch, meta or page');
}
