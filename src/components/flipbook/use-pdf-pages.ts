'use client';

import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPdfPage } from './pdf-render';

export { renderPdfPage };

export interface PdfPagesResult {
  pages: string[];
  texts: string[];
  aspect: number | null;
  error: string | null;
  ready: boolean;
  /** PDF page numbers pdfjs could not draw (they keep a visible placeholder). */
  failedPages: number[];
}

/**
 * Renders every page of a PDF to JPEG dataURLs (single fast pass) and
 * extracts each page's text (used by the search box).
 *
 * The book keeps these medium-resolution images; the hi-res version of a
 * page is produced ON DEMAND by the zoom overlay (renderPdfPage at a bigger
 * scale) — Google-Books style. Upgrading pages in place would change the
 * memoized book children identity while page-flip is mounted, which crashes
 * React ("insertBefore NotFoundError").
 */
const pagesCache = new WeakMap<
  PDFDocumentProxy,
  { pages: string[]; texts: string[]; aspect: number | null; numPages: number }
>();

/**
 * Resolution of the page images kept by the book. The first page used to be
 * rendered at 1x while the rest used 1.4x, so the cover looked visibly softer
 * than the following pages — every page is now rendered at the same scale.
 */
const PAGE_SCALE = 1.4;

/**
 * A page that pdfjs cannot draw still has to occupy its slot: dropping it
 * shifted every following page and, when the last page failed, left `ready`
 * false forever (the reader spun on "Rendering pages…" with no way out).
 */
function placeholderPage(pageNumber: number) {
  const label = `Page ${pageNumber} could not be rendered`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">` +
    `<rect width="600" height="800" fill="#f5f2ec"/>` +
    `<text x="300" y="400" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#8a8578">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function usePdfPages(doc: PDFDocumentProxy | null): PdfPagesResult {
  const [pages, setPages] = useState<string[]>([]);
  const [texts, setTexts] = useState<string[]>([]);
  const [aspect, setAspect] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  // Pages that finished — successfully or not. `pages.length` cannot be used:
  // a failed page would never fill its slot.
  const [completed, setCompleted] = useState(0);
  const [failedPages, setFailedPages] = useState<number[]>([]);

  useEffect(() => {
    if (!doc) {
      setPages([]);
      setTexts([]);
      setAspect(null);
      setError(null);
      setNumPages(0);
      setCompleted(0);
      setFailedPages([]);
      return;
    }
    const cached = pagesCache.get(doc);
    if (cached) {
      setPages(cached.pages);
      setTexts(cached.texts);
      setAspect(cached.aspect);
      setError(null);
      setNumPages(cached.numPages);
      setCompleted(cached.numPages);
      setFailedPages([]);
      return;
    }
    let cancelled = false;
    setPages([]);
    setTexts([]);
    setAspect(null);
    setError(null);
    setNumPages(doc.numPages);
    setCompleted(0);
    setFailedPages([]);

    const idle = () =>
      new Promise<void>((resolve) => {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
          globalThis.setTimeout(resolve, 0);
        }
      });

    (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        // The aspect ratio comes from the page geometry, not from whether the
        // canvas could be drawn: a failing first page used to leave the book
        // at 0×0 with no error at all.
        if (i === 1) {
          try {
            const first = await doc.getPage(1);
            const viewport = first.getViewport({ scale: 1 });
            if (viewport.height > 0 && !cancelled) setAspect(viewport.width / viewport.height);
          } catch {
            // Keep the default aspect; the book still renders.
          }
        }

        const r = await renderPdfPage(doc, i, { scale: PAGE_SCALE });
        if (cancelled) return;
        if (r) {
          setPages((cur) => {
            const next = [...cur];
            next[i - 1] = r.url;
            return next;
          });
          setTexts((cur) => {
            const next = [...cur];
            next[i - 1] = r.text;
            return next;
          });
        } else {
          setPages((cur) => {
            const next = [...cur];
            next[i - 1] = placeholderPage(i);
            return next;
          });
          setTexts((cur) => {
            const next = [...cur];
            next[i - 1] = '';
            return next;
          });
          setFailedPages((cur) => (cur.includes(i) ? cur : [...cur, i]));
        }
        setCompleted(i);
        await idle();
      }
    })().catch(() => {
      if (!cancelled) setError('The pages could not be rendered.');
    });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  // All pages settled? page-flip must mount once with the FULL set of
  // children — adding pages while it is initialized crashes React
  // (insertBefore NotFoundError) because the library moves DOM nodes.
  const ready = error ? pages.length > 0 : numPages > 0 && completed >= numPages;

  useEffect(() => {
    if (doc && ready && !pagesCache.has(doc)) {
      pagesCache.set(doc, { pages, texts, aspect, numPages });
    }
  }, [doc, ready, pages, texts, aspect, numPages]);

  return { pages, texts, aspect, error, ready, failedPages };
}
