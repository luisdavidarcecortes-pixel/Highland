'use client';

import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function usePdfDoc(url: string | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Download progress 0..1; null while idle or when the size is unknown. */
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    if (!url) return;
    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    setLoading(true);
    setError(null);
    setDoc(null);
    setProgress(0);

    (async () => {
      try {
        // pdfjs' internal ranged/streamed loading can hang forever on some
        // servers (e.g. Supabase Storage). A plain fetch + ArrayBuffer is
        // reliable and lets the browser HTTP cache do its job — and reading
        // the body in chunks gives us real download progress for big PDFs.
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const total = Number(res.headers.get('content-length') ?? 0);
        let data: Uint8Array;

        if (res.body && typeof res.body.getReader === 'function') {
          reader = res.body.getReader();
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

        setProgress(1);
        const d = await pdfjsLib.getDocument({ data }).promise;
        if (!cancelled) setDoc(d);
      } catch {
        if (!cancelled) setError('The PDF could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        void reader?.cancel();
      } catch {
        // ignore cancel races
      }
    };
  }, [url]);

  return { doc, loading, error, progress };
}
