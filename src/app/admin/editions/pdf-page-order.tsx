'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import { renderPdfPage } from '@/components/flipbook/pdf-render';

interface Props {
  file: File;
  disabled: boolean;
  confirmed: boolean;
  onChange: () => void;
  onConfirm: (order: number[]) => void;
}

export function PdfPageOrder({ file, disabled, confirmed, onChange, onConfirm }: Props) {
  const [order, setOrder] = useState<number[]>([]);
  const [previews, setPreviews] = useState<Record<number, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const draggedPage = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const urls: string[] = [];
    let task: PDFDocumentLoadingTask | undefined;
    function closePdf() {
      const openTask = task;
      task = undefined;
      void openTask?.destroy().catch(() => {});
    }

    async function prepare() {
      setOrder([]);
      setPreviews({});
      setError(null);
      setLoading(true);
      try {
        const [pdfjs, bytes] = await Promise.all([import('pdfjs-dist'), file.arrayBuffer()]);
        if (signal.aborted) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
        const doc = await task.promise;
        if (signal.aborted) return;
        if (!doc.numPages) throw new Error('This PDF does not contain any pages.');
        const pages = Array.from({ length: doc.numPages }, (_, index) => index + 1);
        setOrder(pages);
        for (const page of pages) {
          if (signal.aborted) return;
          const preview = await renderPdfPage(doc, page, { scale: 0.55, maxPixels: 150_000, signal });
          if (signal.aborted) {
            if (preview) URL.revokeObjectURL(preview.url);
            return;
          }
          if (preview) urls.push(preview.url);
          setPreviews(current => ({ ...current, [page]: preview?.url ?? null }));
        }
      } catch (error) {
        if (!signal.aborted) setError(error instanceof Error ? error.message : 'Could not open this PDF.');
      } finally {
        closePdf();
        if (!signal.aborted) setLoading(false);
      }
    }

    void prepare();
    return () => {
      controller.abort();
      closePdf();
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [file]);

  function move(from: number, to: number) {
    if (disabled || from === to || from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    const [page] = next.splice(from, 1);
    next.splice(to, 0, page);
    setOrder(next);
    onChange();
  }

  const control = 'rounded-md border border-ink/15 px-2 py-1.5 hover:bg-brand/10 disabled:opacity-40';
  return (
    <section aria-label="Manual page order" className="space-y-3 rounded-lg border border-ink/15 p-3">
      <div>
        <h3 className="text-sm font-semibold">Arrange PDF pages</h3>
        <p className="mt-1 text-xs text-ink/70">Drag pages into place or use the arrow buttons. The first page becomes the cover.</p>
      </div>
      {loading && <p role="status" className="text-xs text-ink/70">Preparing thumbnails{order.length ? ` (${Object.keys(previews).length}/${order.length})` : '…'}</p>}
      {error && <p role="alert" className="text-sm">{error}</p>}
      <ol className="grid max-h-[28rem] grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2 overflow-auto">
        {order.map((page, index) => (
          <li
            key={page}
            className={`min-w-0 rounded-md border p-2 ${index === 0 ? 'border-brand bg-brand/5' : 'border-ink/15'}`}
            onDragOver={event => { if (!disabled && draggedPage.current !== null) event.preventDefault(); }}
            onDrop={event => {
              event.preventDefault();
              if (draggedPage.current !== null) move(order.indexOf(draggedPage.current), index);
              draggedPage.current = null;
            }}
          >
            <div className="mb-1 text-xs font-semibold">{index + 1}. {index === 0 ? 'Cover' : `PDF page ${page}`}</div>
            <div
              draggable={!disabled}
              onDragStart={event => {
                draggedPage.current = page;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(page));
              }}
              onDragEnd={() => { draggedPage.current = null; }}
              className={`relative grid aspect-[3/4] place-items-center overflow-hidden rounded bg-white ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
            >
              {previews[page] ? <img src={previews[page]!} alt={`PDF page ${page}`} draggable={false} className="h-full w-full object-contain" /> : (
                <span className="p-1 text-center text-xs text-ink/60">{previews[page] === null ? 'Preview unavailable' : `PDF page ${page}`}</span>
              )}
              <GripVertical aria-hidden="true" size={14} className="pointer-events-none absolute right-0 top-0 rounded bg-white/90" />
            </div>
            {index === 0 && <p className="mt-1 text-xs text-ink/70">PDF page {page}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              <button type="button" aria-label={`Move PDF page ${page} earlier`} className={control} disabled={disabled || index === 0} onClick={() => move(index, index - 1)}><ArrowLeft size={14} aria-hidden="true" /></button>
              <button type="button" aria-label={`Move PDF page ${page} later`} className={control} disabled={disabled || index === order.length - 1} onClick={() => move(index, index + 1)}><ArrowRight size={14} aria-hidden="true" /></button>
              {index > 0 && <button type="button" aria-label={`Use PDF page ${page} as cover`} className={`${control} text-xs`} disabled={disabled} onClick={() => move(index, 0)}>Make cover</button>}
            </div>
          </li>
        ))}
      </ol>
      <button type="button" disabled={disabled || loading || !!error || !order.length || confirmed} onClick={() => onConfirm(order)} className={`${control} text-sm font-semibold text-brand`}>
        {confirmed ? 'Page order confirmed' : 'Confirm page order'}
      </button>
    </section>
  );
}
