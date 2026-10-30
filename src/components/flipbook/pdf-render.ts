'use client';

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface RenderedPage {
  url: string;
  text: string;
}

/**
 * Ceiling for one rendered page. At 2.6x a 1275×1650 pt page would need a
 * 3315×4290 canvas (~57 MB of RGBA, ~200 MB of decoded JPEG): enough to make a
 * phone tab crash. Clamping the scale keeps the zoom sharp while bounding the
 * allocation to a size mobile browsers survive.
 */
const MAX_RENDER_PIXELS = 12_000_000;

/** Renders one PDF page to a JPEG dataURL and extracts its text. */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  opts: { scale: number; quality?: number } = { scale: 1.5 }
): Promise<RenderedPage | null> {
  let canvas: HTMLCanvasElement | null = null;
  let page: PDFPageProxy | null = null;
  try {
    page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const basePixels = base.width * base.height;
    let scale = opts.scale;
    if (basePixels > 0) {
      const projected = basePixels * scale * scale;
      if (projected > MAX_RENDER_PIXELS) {
        scale *= Math.sqrt(MAX_RENDER_PIXELS / projected);
      }
    }

    const viewport = page.getViewport({ scale });
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
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
  } finally {
    // pdfjs keeps the operator list and the canvas backing store alive until
    // told otherwise; releasing both matters when a whole issue is rendered.
    try {
      page?.cleanup();
    } catch {
      /* cleanup is best effort */
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
