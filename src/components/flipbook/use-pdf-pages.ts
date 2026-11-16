'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPdfPage } from './pdf-render';
import { schedulePdfWork } from './schedule-work';
export { renderPdfPage };

export interface PdfPagesResult {
  pages: string[]; texts: string[]; aspect: number | null; error: string | null;
  ready: boolean; failedPages: number[]; numPages: number; completed: number; retry: () => void;
}
interface CachedPages {
  pages: string[]; texts: string[]; aspect: number; settled: Set<number>;
  detailed: Set<number>; failed: Set<number>;
}
const cache = new Map<PDFDocumentProxy, CachedPages>();
const placeholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#f5f2ec"/><text x="300" y="400" text-anchor="middle" font-size="22" fill="#6c675d">Preparing page…</text></svg>');

function remember(doc: PDFDocumentProxy): CachedPages {
  const existing = cache.get(doc);
  if (existing) { cache.delete(doc); cache.set(doc, existing); return existing; }
  const value: CachedPages = { pages: Array(doc.numPages).fill(placeholder), texts: Array(doc.numPages).fill(''), aspect: 0.75, settled: new Set(), detailed: new Set(), failed: new Set() };
  cache.set(doc, value);
  while (cache.size > 2) {
    const key = cache.keys().next().value!;
    cache.get(key)?.pages.forEach(src => { if (src.startsWith('blob:')) URL.revokeObjectURL(src); });
    cache.delete(key);
  }
  return value;
}
const empty: PdfPagesResult = { pages: [], texts: [], aspect: 0.75, error: null, ready: false, failedPages: [], numPages: 0, completed: 0, retry: () => {} };

/** Fixed page slots keep page-flip's DOM stable while images arrive. */
export function usePdfPages(doc: PDFDocumentProxy | null, currentPage = 1): PdfPagesResult {
  const [result, setResult] = useState<PdfPagesResult>(empty);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    const entry = doc && cache.get(doc);
    entry?.failed.forEach(n => { entry.settled.delete(n); entry.detailed.delete(n); });
    setAttempt(value => value + 1);
  }, [doc]);
  useEffect(() => {
    if (!doc) { setResult(empty); return; }
    const entry = remember(doc);
    const controller = new AbortController();
    const target = Math.max(1, Math.min(currentPage, doc.numPages));
    const publish = () => {
      if (controller.signal.aborted) return;
      setResult({ pages: [...entry.pages], texts: [...entry.texts], aspect: entry.aspect, error: null,
        // Keep the mounted book while another page is being prepared. Removing
        // it during a flip also removes the double-click target and loses folds.
        ready: entry.settled.size > 0, failedPages: Array.from(entry.failed), numPages: doc.numPages, completed: entry.settled.size, retry });
    };
    publish();
    const idle = () => new Promise<void>(resolve => schedulePdfWork(resolve));
    (async () => {
      const priority = [target, target + 1, target - 1, target + 2].filter(n => n > 0 && n <= doc.numPages);
      const order = Array.from(new Set([...priority, ...Array.from({ length: doc.numPages }, (_, i) => i + 1)]));
      for (const n of order) {
        if (controller.signal.aborted) return;
        const detailed = priority.includes(n);
        if (entry.settled.has(n) && (!detailed || entry.detailed.has(n))) continue;
        await idle(); // Give navigation and input a turn before each canvas operation.
        if (controller.signal.aborted) return;
        const rendered = await renderPdfPage(doc, n, { scale: detailed ? 0.9 : 0.35, signal: controller.signal, maxPixels: detailed ? 1600000 : 220000 });
        if (controller.signal.aborted) { if (rendered?.url.startsWith('blob:')) URL.revokeObjectURL(rendered.url); return; }
        if (rendered) {
          if (entry.settled.size === 0 && rendered.aspect) entry.aspect = rendered.aspect;
          const previous = entry.pages[n - 1];
          entry.pages[n - 1] = rendered.url;
          entry.texts[n - 1] = rendered.text;
          if (previous.startsWith('blob:')) URL.revokeObjectURL(previous);
          entry.failed.delete(n);
          if (detailed) entry.detailed.add(n);
        } else {
          entry.failed.add(n);
          // A failed sharp render must not replace a readable preview.
          if (entry.pages[n - 1] === placeholder) entry.pages[n - 1] = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#f5f2ec"/><text x="300" y="400" text-anchor="middle" font-size="20">Page ' + n + ' could not be rendered</text></svg>');
        }
        entry.settled.add(n);
        publish();
      }
    })().catch(() => {
      if (!controller.signal.aborted) setResult(previous => ({ ...previous, ready: false, error: 'The pages could not be rendered. Try opening the PDF directly.' }));
    });
    return () => controller.abort();
  }, [doc, currentPage, attempt, retry]);
  return { ...result, retry };
}
