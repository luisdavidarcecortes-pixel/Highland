'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Parsed PDFs are expensive: one issue is ~44 MB of compressed bytes and the
 * parsed document keeps every page's operator list in memory. The previous
 * unbounded Map kept every issue the visitor had opened alive for the whole
 * session (and `usePdfPages` kept every page JPEG next to it). An LRU of two
 * documents is enough for back-and-forth navigation and bounds the memory.
 */
const DOC_CACHE_LIMIT = 2;
/** Abort when no bytes arrive for this long (a stalled CDN or dead network). */
const STALL_TIMEOUT_MS = 30_000;
/** Hard ceiling for one document, even if bytes keep trickling in. */
const MAX_LOAD_MS = 2 * 60 * 1000;

const cache = new Map<string, PDFDocumentProxy>();

/** A load failure with a message that is safe and useful to show the reader. */
class PdfLoadError extends Error {}

function rememberDocument(url: string, doc: PDFDocumentProxy) {
  cache.delete(url);
  cache.set(url, doc);
  while (cache.size > DOC_CACHE_LIMIT) {
    const oldestUrl = cache.keys().next().value as string | undefined;
    if (!oldestUrl || oldestUrl === url) break;
    const oldest = cache.get(oldestUrl);
    cache.delete(oldestUrl);
    // Best effort: a document that is still rendering pages may reject.
    void oldest?.destroy().catch(() => {});
  }
}

function forgetDocument(url: string) {
  const cached = cache.get(url);
  cache.delete(url);
  if (cached) void cached.destroy().catch(() => {});
}

function loadErrorMessage(error: unknown, stalled: boolean): string {
  if (stalled) return 'The download stalled. Check your connection and try again.';
  if (error instanceof PdfLoadError) return error.message;
  return 'The PDF could not be loaded.';
}

export function usePdfDoc(url: string | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Download progress 0..1; null while idle or when the size is unknown. */
  const [progress, setProgress] = useState<number | null>(null);
  /** Bumped by retry() to re-run the effect for the same URL. */
  const [attempt, setAttempt] = useState(0);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  docRef.current = doc;

  const retry = useCallback(() => {
    if (!url) return;
    // A failed load never cached anything; if a document exists, keep the one
    // on screen and only drop a stale cached copy for this URL.
    const cached = cache.get(url);
    if (cached && cached !== docRef.current) forgetDocument(url);
    setError(null);
    setProgress(null);
    setAttempt((n) => n + 1);
  }, [url]);

  useEffect(() => {
    if (!url) {
      setDoc(null);
      setError(null);
      setLoading(false);
      setProgress(null);
      return;
    }

    const cachedDoc = cache.get(url);
    if (cachedDoc) {
      // Refresh the LRU position without re-downloading.
      cache.delete(url);
      cache.set(url, cachedDoc);
      setDoc(cachedDoc);
      setError(null);
      setLoading(false);
      setProgress(1);
      return;
    }

    let cancelled = false;
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const clearStall = () => {
      if (stallTimer !== null) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };
    const armStall = () => {
      clearStall();
      stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, STALL_TIMEOUT_MS);
    };
    const hardCap = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, MAX_LOAD_MS);

    setLoading(true);
    setError(null);
    setDoc(null);
    setProgress(0);

    (async () => {
      try {
        armStall();
        // pdfjs' internal ranged loading can hang forever on some servers
        // (e.g. Supabase Storage). A plain fetch is reliable, lets the browser
        // HTTP cache work, and gives real progress for big PDFs.
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          if (res.status === 404) {
            throw new PdfLoadError("This issue's PDF is no longer available.");
          }
          if (res.status === 401 || res.status === 403) {
            throw new PdfLoadError('You do not have access to this PDF.');
          }
          if (res.status >= 500) {
            throw new PdfLoadError('The server could not deliver the PDF. Try again in a moment.');
          }
          throw new PdfLoadError(`The PDF could not be loaded (HTTP ${res.status}).`);
        }

        // A 200 HTML login page or an XML storage error would otherwise reach
        // pdfjs and surface as the generic "could not be loaded".
        const contentType = res.headers.get('content-type') ?? '';
        if (contentType && !/pdf|octet-stream/i.test(contentType)) {
          throw new PdfLoadError('The link did not return a PDF file.');
        }

        const total = Number(res.headers.get('content-length') ?? 0);
        let data: Uint8Array;

        if (res.body && typeof res.body.getReader === 'function') {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (cancelled) {
              void reader.cancel();
              return;
            }
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.length;
              armStall();
              setProgress(total > 0 ? Math.min(1, received / total) : null);
            }
          }
          data = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
          }
        } else {
          data = new Uint8Array(await res.arrayBuffer());
          if (cancelled) return;
        }

        clearStall();
        setProgress(1);

        // Imported here, not at module scope: Flipbook is rendered on the
        // server first, and evaluating pdfjs in Node prints its "use the
        // legacy build" warning and drags the library into the server bundle.
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const loaded = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        rememberDocument(url, loaded);
        setDoc(loaded);
      } catch (err) {
        if (cancelled) return;
        if (stalled) setProgress(null);
        setError(loadErrorMessage(err, stalled));
      } finally {
        clearStall();
        clearTimeout(hardCap);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearStall();
      clearTimeout(hardCap);
      controller.abort();
    };
  }, [url, attempt]);

  return { doc, loading, error, progress, retry };
}
