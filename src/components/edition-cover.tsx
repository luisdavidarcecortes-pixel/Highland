'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';

let coverDatabase: Promise<IDBDatabase> | null = null;

/**
 * Only one cover is rendered at a time: several pdf.js documents in parallel
 * would download and decode the same PDF at once, which is what makes the
 * archive page slow on a cold cache.
 */
let coverQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = coverQueue.then(task, task);
  coverQueue = run.catch(() => undefined);
  return run;
}

function openCoverDatabase() {
  if (!coverDatabase) {
    coverDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('highlander-covers', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('covers');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return coverDatabase;
}

async function getCachedCover(url: string): Promise<Blob | null> {
  const database = await openCoverDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('covers', 'readonly').objectStore('covers').get(url);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}

async function cacheCover(url: string, cover: Blob) {
  const database = await openCoverDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('covers', 'readwrite');
    transaction.objectStore('covers').put(cover, url);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

interface EditionCoverProps {
  coverUrl: string | null;
  pdfUrl: string;
  alt: string;
  className: string;
  sizes: string;
}

export function EditionCover({
  coverUrl,
  pdfUrl,
  alt,
  className,
  sizes,
}: EditionCoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [generatedCover, setGeneratedCover] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(Boolean(coverUrl));

  useEffect(() => {
    if (coverUrl || shouldLoad) return;

    const container = containerRef.current;
    if (!container || !('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [coverUrl, shouldLoad]);

  useEffect(() => {
    if (coverUrl || !shouldLoad) return;

    let cancelled = false;
    setFailed(false);
    let documentTask: PDFDocumentLoadingTask | null = null;

    async function renderFirstPage() {
      try {
        const cachedCover = await getCachedCover(pdfUrl).catch((error: unknown) => {
          console.warn('Could not read the cached edition cover.', error);
          return null;
        });
        if (cancelled) return;
        if (cachedCover) {
          setGeneratedCover(URL.createObjectURL(cachedCover));
          return;
        }

        // Loaded on demand: this component is server-rendered first, and
        // evaluating pdfjs in Node prints a warning and grows the server
        // bundle for a library only the browser can use. One cover is rendered
        // at a time so the archive page does not open every PDF at once.
        const cover = await enqueue(async () => {
          const pdfjsLib = await import('pdfjs-dist');
          if (cancelled) return null;
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          documentTask = pdfjsLib.getDocument({
            url: pdfUrl,
            rangeChunkSize: 64 * 1024,
          });
          const pdf = await documentTask.promise;
          try {
            if (cancelled) return null;
            const page = await pdf.getPage(1);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = Math.min(1.25, 720 / Math.max(baseViewport.width, baseViewport.height));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not prepare the PDF cover image.');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport }).promise;
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (value) => (value ? resolve(value) : reject(new Error('Could not export the PDF cover image.'))),
                'image/jpeg',
                0.86
              );
            });
            canvas.width = 0;
            canvas.height = 0;
            return blob;
          } finally {
            documentTask = null;
            await pdf.destroy();
          }
        });
        if (!cover || cancelled) return;
        setGeneratedCover(URL.createObjectURL(cover));
        void cacheCover(pdfUrl, cover).catch((error: unknown) => {
          console.warn('Could not cache the generated edition cover.', error);
        });
      } catch (error) {
        if (!cancelled) {
          setFailed(true);
          console.error('Failed to render the first page as an edition cover.', error);
        }
        void documentTask?.destroy();
        documentTask = null;
      }
    }

    void renderFirstPage();
    return () => {
      cancelled = true;
      if (documentTask) void documentTask.destroy();
    };
  }, [coverUrl, pdfUrl, shouldLoad]);

  useEffect(() => {
    return () => {
      if (generatedCover?.startsWith('blob:')) URL.revokeObjectURL(generatedCover);
    };
  }, [generatedCover]);

  return (
    <div ref={containerRef} className={className}>
      {coverUrl || generatedCover ? (
        <Image
          src={coverUrl ?? generatedCover!}
          alt={alt}
          fill
          unoptimized={Boolean(generatedCover)}
          className="object-cover"
          sizes={sizes}
        />
      ) : (
        <div
          aria-label={failed ? 'Cover unavailable' : shouldLoad ? 'Loading cover from the first page of the PDF' : undefined}
          className="flex h-full w-full items-center justify-center bg-brand/10"
        >
          {failed ? <span className="px-4 text-center text-sm text-ink/60">Cover unavailable</span> : shouldLoad && (
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand/25 border-t-brand" />
          )}
        </div>
      )}
    </div>
  );
}
