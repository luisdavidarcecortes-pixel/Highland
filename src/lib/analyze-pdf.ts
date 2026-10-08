'use client';

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface PdfAnalysis {
  file: File;
  pageCount: number;
  pageOrderChanged: boolean;
  title: string | null;
  description: string | null;
  editionDate: string | null; // yyyy-mm-dd
  schoolYear: string | null; // "2026-27"
  cover: File;
  /** Raw text from the first pages, for AI description generation. */
  text: string;
}

interface AnalyzedPage {
  pdfIndex: number;
  printedNumber: number | null;
  text: string;
  runs: { text: string; height: number }[];
}

type PdfAnalysisProgress = (message: string) => void;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const MONTH_PATTERN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s+(\d{4})\b/i;

const MASTHEADS =
  /\b(?:the\s+)?highlander\b|\bhighland\s+academy\b|\bstudent\s+newspaper\b|\bvol(?:ume)?\.?\s*\d+|\bissue\s*(?:no\.?)?\s*\d+/i;

function schoolYearFrom(y: number, m: number): string {
  // The school year starts in August.
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function isoFrom(y: number, m: number, d = 1): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Detects "August 2026", "Sept 2026", "2026-09-24"… in a text blob. */
function findDate(text: string): { y: number; m: number; d?: number } | null {
  const monthYear = text.match(MONTH_PATTERN);
  if (monthYear) {
    const key = monthYear[1].slice(0, 3).toLowerCase();
    const month = Object.entries(MONTHS).find(([k]) => k.startsWith(key))?.[1];
    if (month) return { y: Number(monthYear[2]), m: month };
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  return null;
}

/**
 * Analyzes a newspaper PDF in the browser (Plan B):
 * - verifies and sorts pages by their printed page numbers
 * - title: biggest non-masthead text on the first numbered page, falling back to PDF metadata
 * - description: first long-ish line from the first numbered pages
 * - editionDate / schoolYear: "Month YYYY" found in metadata title or page text
 */
export async function analyzePdf(
  file: File,
  onProgress?: PdfAnalysisProgress
): Promise<PdfAnalysis> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const bytes = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;

  try {
    const meta = (await doc.getMetadata()).info as { Title?: string; Subject?: string };
    const metaTitle = (meta.Title ?? '').trim() || null;
    if (doc.numPages === 0) throw new Error('This PDF does not contain any pages.');

    const analyzedPages: AnalyzedPage[] = [];
    const pagesWithAmbiguousNumber: number[] = [];

    for (let pdfIndex = 0; pdfIndex < doc.numPages; pdfIndex++) {
      const page = await doc.getPage(pdfIndex + 1);
      const content = await page.getTextContent();
      const candidates = findFooterPageNumbers(page, content.items);

      if (candidates.length > 1) pagesWithAmbiguousNumber.push(pdfIndex + 1);

      const runs: { text: string; height: number }[] = [];
      const pageText: string[] = [];
      for (const item of content.items) {
        if (!('str' in item) || typeof item.str !== 'string') continue;
        const text = item.str.trim();
        if (text.length < 2) continue;
        pageText.push(text);
        runs.push({ text, height: Math.abs(item.transform[3]) });
      }

      analyzedPages.push({
        pdfIndex,
        printedNumber: candidates.length === 1 ? candidates[0] : null,
        text: pageText.join(' '),
        runs,
      });
    }

    const pagesForOcr = analyzedPages.filter(
      (page) => page.printedNumber === null && !pagesWithAmbiguousNumber.includes(page.pdfIndex + 1)
    );
    if (pagesForOcr.length) {
      onProgress?.(
        `Reading printed numbers from ${pagesForOcr.length} scanned page footer(s) with Gemini…`
      );
      const ocrNumbers = await readScannedPageNumbers(pagesForOcr, doc, onProgress);
      for (const page of pagesForOcr) {
        page.printedNumber = ocrNumbers.get(page.pdfIndex + 1) ?? null;
      }
    }

    const pagesWithoutNumber = analyzedPages
      .filter((page) => page.printedNumber === null && !pagesWithAmbiguousNumber.includes(page.pdfIndex + 1))
      .map((page) => page.pdfIndex + 1);
    if (pagesWithoutNumber.length || pagesWithAmbiguousNumber.length) {
      const details = [
        pagesWithoutNumber.length
          ? `no clear printed number on PDF page(s) ${pagesWithoutNumber.join(', ')}`
          : '',
        pagesWithAmbiguousNumber.length
          ? `multiple possible numbers on PDF page(s) ${pagesWithAmbiguousNumber.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('; ');
      throw new Error(
        `Could not safely reorder this PDF: ${details}. Make sure every page has one clear page number near the bottom, then upload it again.`
      );
    }

    const occurrences = new Map<number, number[]>();
    for (const page of analyzedPages) {
      const printedNumber = page.printedNumber;
      if (printedNumber === null) continue;
      const physicalPages = occurrences.get(printedNumber) ?? [];
      physicalPages.push(page.pdfIndex + 1);
      occurrences.set(printedNumber, physicalPages);
    }
    const duplicates = Array.from(occurrences.entries()).filter(
      ([, physicalPages]) => physicalPages.length > 1
    );
    if (duplicates.length) {
      const details = duplicates
        .map(([number, physicalPages]) => `${number} (PDF page(s) ${physicalPages.join(', ')})`)
        .join('; ');
      throw new Error(
        `Could not safely reorder this PDF: printed page numbers are duplicated: ${details}. Check the PDF and upload it again.`
      );
    }

    const orderedPages = [...analyzedPages].sort(
      (a, b) => (a.printedNumber ?? Number.MAX_SAFE_INTEGER) - (b.printedNumber ?? Number.MAX_SAFE_INTEGER)
    );
    for (let index = 1; index < orderedPages.length; index++) {
      const previous = orderedPages[index - 1].printedNumber;
      const current = orderedPages[index].printedNumber;
      if (previous !== null && current !== null && current !== previous + 1) {
        throw new Error(
          `Could not safely reorder this PDF: page numbering skips from ${previous} to ${current}. Check for missing or unreadable pages, then upload it again.`
        );
      }
    }
    const pageOrderChanged = orderedPages.some((page, index) => page.pdfIndex !== index);
    const orderedFile = pageOrderChanged
      ? await createOrderedPdf(file, bytes, orderedPages)
      : file;

    const firstPages = orderedPages.slice(0, 2);
    const runs = firstPages.flatMap((page) => page.runs);
    const pageTexts = firstPages.map((page) => page.text);
    const coverPage = await doc.getPage(orderedPages[0].pdfIndex + 1);
    const baseViewport = coverPage.getViewport({ scale: 1 });
    const scale = Math.min(1.5, 1200 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = coverPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the first numbered page for the cover.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await coverPage.render({ canvasContext: context, viewport }).promise;
    const coverBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not export the first numbered page as a cover.')),
        'image/jpeg',
        0.86
      );
    });
    canvas.width = 0;
    canvas.height = 0;
    const cover = new File([coverBlob], 'edition-cover.jpg', { type: 'image/jpeg' });

    const sorted = runs
      .filter((run) => !MASTHEADS.test(run.text))
      .sort((a, b) => b.height - a.height);
    const headline = sorted[0]?.text ?? null;
    const description =
      sorted
        .slice(1)
        .map((run) => run.text)
        .find((text) => text.length > 40 && text !== headline) ?? null;
    const date = findDate(`${metaTitle ?? ''} ${pageTexts.join(' ')}`);

    return {
      file: orderedFile,
      pageCount: orderedPages.length,
      pageOrderChanged,
      title: headline ?? metaTitle,
      description,
      editionDate: date ? isoFrom(date.y, date.m, date.d) : null,
      schoolYear: date ? schoolYearFrom(date.y, date.m) : null,
      cover,
      text: pageTexts.join('\n').slice(0, 6000),
    };
  } finally {
    await doc.destroy();
  }
}

async function readScannedPageNumbers(
  pages: AnalyzedPage[],
  doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>,
  onProgress?: PdfAnalysisProgress
): Promise<Map<number, number | null>> {
  const results = new Map<number, number | null>();
  const batchSize = 6;

  for (let start = 0; start < pages.length; start += batchSize) {
    const batch = pages.slice(start, start + batchSize);
    const footers: { pdfPage: number; image: string }[] = [];
    for (const pageInfo of batch) {
      const page = await doc.getPage(pageInfo.pdfIndex + 1);
      footers.push({
        pdfPage: pageInfo.pdfIndex + 1,
        image: await renderFooterImage(page),
      });
    }

    const end = start + batch.length;
    onProgress?.(`Gemini is checking scanned page numbers (${end}/${pages.length})…`);
    const response = await fetch('/api/detect-page-numbers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: footers }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      pages?: { pdfPage: number; pageNumber: number | null }[];
    } | null;
    if (!response.ok) {
      throw new Error(
        result?.error ?? `Gemini could not read the scanned page numbers (HTTP ${response.status}).`
      );
    }
    if (!result || !Array.isArray(result.pages)) {
      throw new Error('Gemini returned an invalid page-number response.');
    }

    const expectedPages = new Set(footers.map((footer) => footer.pdfPage));
    for (const pageResult of result.pages) {
      if (
        !expectedPages.has(pageResult.pdfPage) ||
        results.has(pageResult.pdfPage) ||
        (pageResult.pageNumber !== null &&
          (!Number.isSafeInteger(pageResult.pageNumber) || pageResult.pageNumber <= 0))
      ) {
        throw new Error('Gemini returned an invalid page-number response.');
      }
      results.set(pageResult.pdfPage, pageResult.pageNumber);
    }
    if (results.size !== end) {
      throw new Error('Gemini could not confidently identify every scanned page number.');
    }
  }

  return results;
}

async function renderFooterImage(page: PDFPageProxy): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.5, 900 / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = Math.ceil(viewport.width);
  pageCanvas.height = Math.ceil(viewport.height);
  const pageContext = pageCanvas.getContext('2d');
  if (!pageContext) throw new Error('Could not prepare a scanned page for number recognition.');

  await page.render({ canvasContext: pageContext, viewport }).promise;
  const footerHeight = Math.max(1, Math.floor(pageCanvas.height * 0.22));
  const footerCanvas = document.createElement('canvas');
  footerCanvas.width = pageCanvas.width;
  footerCanvas.height = footerHeight;
  const footerContext = footerCanvas.getContext('2d');
  if (!footerContext) throw new Error('Could not prepare a page footer for number recognition.');

  footerContext.drawImage(
    pageCanvas,
    0,
    pageCanvas.height - footerHeight,
    pageCanvas.width,
    footerHeight,
    0,
    0,
    footerCanvas.width,
    footerCanvas.height
  );
  pageCanvas.width = 0;
  pageCanvas.height = 0;
  const image = footerCanvas.toDataURL('image/jpeg', 0.72);
  footerCanvas.width = 0;
  footerCanvas.height = 0;
  return image;
}

function findFooterPageNumbers(
  page: PDFPageProxy,
  items: Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items']
): number[] {
  const viewport = page.getViewport({ scale: 1 });
  const candidates = new Set<number>();

  for (const item of items) {
    if (!('str' in item) || typeof item.str !== 'string') continue;
    const text = item.str.trim().replace(/^[#([{"']+|[)\]},.:;'"']+$/g, '');
    const match = /^(?:page\s*)?(\d{1,4})$/i.exec(text);
    if (!match) continue;

    const [, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    if (y < viewport.height * 0.78) continue;

    const pageNumber = Number(match[1]);
    if (pageNumber > 0) candidates.add(pageNumber);
  }

  return Array.from(candidates);
}

async function createOrderedPdf(
  file: File,
  bytes: ArrayBuffer,
  pages: AnalyzedPage[]
): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes);
  const ordered = await PDFDocument.create();
  const copiedPages = await ordered.copyPages(
    source,
    pages.map((page) => page.pdfIndex)
  );
  copiedPages.forEach((page) => ordered.addPage(page));

  const title = source.getTitle();
  const author = source.getAuthor();
  const subject = source.getSubject();
  const keywords = source.getKeywords();
  const creator = source.getCreator();
  const producer = source.getProducer();
  const creationDate = source.getCreationDate();
  const modificationDate = source.getModificationDate();
  if (title) ordered.setTitle(title);
  if (author) ordered.setAuthor(author);
  if (subject) ordered.setSubject(subject);
  if (keywords) ordered.setKeywords(keywords.split(/\s*,\s*/));
  if (creator) ordered.setCreator(creator);
  if (producer) ordered.setProducer(producer);
  if (creationDate) ordered.setCreationDate(creationDate);
  if (modificationDate) ordered.setModificationDate(modificationDate);

  const orderedBytes = await ordered.save();
  const orderedBuffer = new ArrayBuffer(orderedBytes.byteLength);
  new Uint8Array(orderedBuffer).set(orderedBytes);
  return new File([orderedBuffer], file.name, { type: 'application/pdf' });
}
