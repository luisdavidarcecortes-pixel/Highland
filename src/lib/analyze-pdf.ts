'use client';

import * as pdfjsLib from 'pdfjs-dist';

export interface PdfAnalysis {
  title: string | null;
  description: string | null;
  editionDate: string | null; // yyyy-mm-dd
  schoolYear: string | null; // "2026-27"
  cover: File;
  /** Raw text from the first pages, for AI description generation. */
  text: string;
}

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
 * - title: biggest non-masthead text on the cover, falling back to PDF metadata
 * - description: first long-ish line from the first pages
 * - editionDate / schoolYear: "Month YYYY" found in metadata title or page text
 */
export async function analyzePdf(file: File): Promise<PdfAnalysis> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

  // 1) Metadata (Canva usually sets the title)
  const meta = (await doc.getMetadata()).info as { Title?: string; Subject?: string };
  const metaTitle = (meta.Title ?? '').trim() || null;

  // 2) Text runs from the first two pages, with their font sizes
  const runs: { text: string; height: number }[] = [];
  const pageTexts: string[] = [];
  for (let p = 1; p <= Math.min(2, doc.numPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const str = item.str.trim();
      if (str.length < 2) continue;
      pageText += ` ${str}`;
      runs.push({ text: str, height: Math.abs(item.transform[3]) });
    }
    pageTexts.push(pageText);
  }

  const coverPage = await doc.getPage(1);
  const baseViewport = coverPage.getViewport({ scale: 1 });
  const scale = Math.min(1.5, 1200 / Math.max(baseViewport.width, baseViewport.height));
  const viewport = coverPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the first PDF page for the cover.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await coverPage.render({ canvasContext: context, viewport }).promise;
  const coverBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not export the first PDF page as a cover.'))),
      'image/jpeg',
      0.86
    );
  });
  canvas.width = 0;
  canvas.height = 0;
  const cover = new File([coverBlob], 'edition-cover.jpg', { type: 'image/jpeg' });

  // The extracted text may split a headline across text runs; use the largest
  // eligible run as a fallback, while Gemini sees the complete first pages.
  const sorted = runs
    .filter((r) => !MASTHEADS.test(r.text))
    .sort((a, b) => b.height - a.height);
  const headline = sorted[0]?.text ?? null;

  // Description: first long, sentence-like line that is not the headline
  const description =
    sorted
      .slice(1)
      .map((r) => r.text)
      .find((t) => t.length > 40 && t !== headline) ?? null;

  // 3) Date from metadata title or cover text
  const haystack = `${metaTitle ?? ''} ${pageTexts.join(' ')}`;
  const date = findDate(haystack);

  const title = headline ?? metaTitle;

  return {
    title,
    description,
    editionDate: date ? isoFrom(date.y, date.m, date.d) : null,
    schoolYear: date ? schoolYearFrom(date.y, date.m) : null,
    cover,
    text: pageTexts.join('\n').slice(0, 6000),
  };
}
