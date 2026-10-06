'use client';

import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPdfPage } from './pdf-render';

export { renderPdfPage };

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
export function usePdfPages(doc: PDFDocumentProxy | null) {
  const [pages, setPages] = useState<string[]>([]);
  const [texts, setTexts] = useState<string[]>([]);
  const [aspect, setAspect] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (!doc) {
      setPages([]);
      setTexts([]);
      setAspect(null);
      setError(null);
      setNumPages(0);
      return;
    }
    let cancelled = false;
    setPages([]);
    setTexts([]);
    setAspect(null);
    setError(null);
    setNumPages(doc.numPages);

    const idle = () =>
      new Promise<void>((resolve) => {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => resolve(), { timeout: 100 });
        } else {
          globalThis.setTimeout(resolve, 0);
        }
      });

    (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        // First page fixes the book's aspect ratio at scale 1.
        const r = await renderPdfPage(doc, i, { scale: i === 1 ? 1 : 1.4 });
        if (cancelled) return;
        if (r) {
          if (i === 1) {
            const page = await doc.getPage(1);
            const vp = page.getViewport({ scale: 1 });
            setAspect(vp.width / vp.height);
          }
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
        }
        await idle();
      }
    })().catch(() => {
      if (!cancelled) setError('The pages could not be rendered.');
    });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  // All pages rendered? page-flip must mount once with the FULL set of
  // children — adding pages while it is initialized crashes React
  // (insertBefore NotFoundError) because the library moves DOM nodes.
  const ready = error ? pages.length > 0 : numPages > 0 && pages.length >= numPages;

  return { pages, texts, aspect, error, ready };
}
