'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { createPdfRangeTransport } from './pdf-range';
const cache = new Map<string, PDFDocumentProxy>();

export function readerPdfUrl(url: string) {
  if (!url.startsWith('/api/media/')) return url;
  const parsed = new URL(url, 'http://reader.local');
  parsed.searchParams.set('reader', '1');
  return `${parsed.pathname}${parsed.search}`;
}

function forget(url: string) {
  const doc = cache.get(url); cache.delete(url);
  if (doc) void doc.destroy().catch(() => {});
}
function remember(url: string, doc: PDFDocumentProxy) {
  cache.delete(url); cache.set(url, doc);
  while (cache.size > 2) forget(cache.keys().next().value!);
}

/** PDF.js reads byte ranges; opening an issue no longer buffers the entire PDF. */
export function usePdfDoc(url: string | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { if (url) forget(url); setAttempt(n => n + 1); }, [url]);
  useEffect(() => {
    if (!url) { setDoc(null); setLoading(false); setError(null); setProgress(null); return; }
    const cached = cache.get(url);
    if (cached) { cache.delete(url); cache.set(url, cached); setDoc(cached); setLoading(false); setError(null); setProgress(1); return; }
    let cancelled = false;
    let stalled = false;
    let documentLoaded = false;
    const controller = new AbortController();
    let task: PDFDocumentLoadingTask | null = null;
    let lastProgress = 0;
    let lastBytes = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = () => {
      if (cancelled || stalled) return;
      stalled = true;
      setError('The PDF download stalled. Check your connection and try again.');
      setLoading(false);
      controller.abort();
      void task?.destroy().catch(() => {});
    };
    // A slow transfer can still be healthy. Only cancel after a full minute
    // without new bytes; repeated progress events alone must not keep it alive.
    const arm = () => { clearTimeout(timer); timer = setTimeout(timeout, 60000); };
    setDoc(null); setLoading(true); setError(null); setProgress(0);
    arm();
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (cancelled || stalled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const reportProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (cancelled || stalled || documentLoaded) return;
          if (loaded > lastBytes) { lastBytes = loaded; arm(); }
          if (Date.now() - lastProgress > 100) {
            lastProgress = Date.now(); setProgress(previous => total > 0 ? Math.max(previous ?? 0, Math.min(1, Math.max(0, loaded / total))) : previous);
          }
        };
        const range = attempt === 0 && url.startsWith('/api/media/') ? await createPdfRangeTransport(pdfjs.PDFDataRangeTransport, readerPdfUrl(url), {
          signal: controller.signal, onProgress: reportProgress, onError: () => {
            forget(url);
            void task?.destroy().catch(() => {});
            if (!cancelled) {
              stalled = true; clearTimeout(timer); setDoc(null); setLoading(false);
              setError('Some PDF data could not be loaded. Check your connection and try again.');
            }
          },
        }) : undefined;
        if (cancelled || stalled) { range?.abort(); return; }
        task = pdfjs.getDocument({ ...(range ? { range } : { url: readerPdfUrl(url) }), disableAutoFetch: true, disableRange: attempt > 0, disableStream: attempt === 0, rangeChunkSize: 262144, isEvalSupported: false });
        task.onProgress = reportProgress;
        const loaded = await task.promise;
        task.onProgress = () => {};
        if (cancelled || stalled) { void loaded.destroy().catch(() => {}); return; }
        documentLoaded = true;
        remember(url, loaded); setDoc(loaded); setProgress(1);
      } catch (error) {
        if (!cancelled && !stalled) setError(error instanceof Error && /404|missing/i.test(error.message) ? 'This issue’s PDF is no longer available.' : 'The PDF could not be loaded. Check your connection and try again.');
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); if (!cache.has(url)) { controller.abort(); void task?.destroy().catch(() => {}); } };
  }, [url, attempt]);
  return { doc, loading, error, progress, retry };
}
