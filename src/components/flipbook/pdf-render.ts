'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface RenderedPage {
  url: string;
  text: string;
}

/** Renders one PDF page to a JPEG dataURL and extracts its text. */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  opts: { scale: number; quality?: number } = { scale: 1.5 }
): Promise<RenderedPage | null> {
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: opts.scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const text = await page
      .getTextContent()
      .then((tc) =>
        tc.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .catch(() => '');
    return { url: canvas.toDataURL('image/jpeg', opts.quality ?? 0.85), text };
  } catch {
    return null; // a single page failing must not kill the whole book
  }
}
