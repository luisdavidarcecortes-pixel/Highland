'use client';

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { schedulePdfWork } from './schedule-work';

export interface RenderedPage {
  url: string;
  text: string;
  aspect?: number;
}

/**
 * Ceiling for one rendered page. At 2.6x a 1275×1650 pt page would need a
 * 3315×4290 canvas (~57 MB of RGBA, ~200 MB of decoded JPEG): enough to make a
 * phone tab crash. Clamping the scale keeps the zoom sharp while bounding the
 * allocation to a size mobile browsers survive.
 */
const MAX_RENDER_PIXELS = 4_000_000;

/** Renders one PDF page to a JPEG dataURL and extracts its text. */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  opts: { scale: number; quality?: number; signal?: AbortSignal; maxPixels?: number } = { scale: 1.5 }
): Promise<RenderedPage | null> {
  let canvas: HTMLCanvasElement | null = null;
  let page: PDFPageProxy | null = null;
  let cancelRender: (() => void) | undefined;
  // Large image-heavy pages may still be fetching ranges after 30 seconds.
  // Navigation cancellation remains immediate; allow slower pages to finish.
  const deadline = AbortSignal.timeout(120000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new DOMException('Page rendering cancelled or timed out', 'AbortError'));
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const bounded = <T,>(operation: Promise<T>) => Promise.race([operation, aborted]);
  try {
    if (signal.aborted) return null;
    page = await bounded(doc.getPage(pageNumber));
    const base = page.getViewport({ scale: 1 });
    const basePixels = base.width * base.height;
    let scale = opts.scale;
    if (basePixels > 0) {
      const projected = basePixels * scale * scale;
      const ceiling = opts.maxPixels ?? MAX_RENDER_PIXELS;
      if (projected > ceiling) {
        scale *= Math.sqrt(ceiling / projected);
      }
    }

    const viewport = page.getViewport({ scale });
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (signal.aborted) return null;
    const task = page.render({ canvasContext: ctx, viewport });
    cancelRender = () => task.cancel();
    signal.addEventListener('abort', cancelRender, { once: true });
    task.onContinue = (resume: () => void) => schedulePdfWork(resume);
    await bounded(task.promise);
    const text = await bounded(page.getTextContent())
      .then((tc) =>
        tc.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .catch(() => '');
    const blob = await bounded(new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, 'image/jpeg', opts.quality ?? 0.8)));
    if (!blob || signal.aborted) return null;
    return { url: URL.createObjectURL(blob), text, aspect: base.height > 0 ? base.width / base.height : 0.75 };
  } catch (error) {
    if (!opts.signal?.aborted) console.warn('[pdf-page] Could not render page', pageNumber, error instanceof Error ? error.message : 'Unknown rendering error');
    return null; // a single page failing must not kill the whole book
  } finally {
    if (cancelRender) signal.removeEventListener('abort', cancelRender);
    if (rejectAbort) signal.removeEventListener('abort', rejectAbort);
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
