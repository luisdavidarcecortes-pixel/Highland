'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { renderPdfPage } from './pdf-render';

export function PageZoom({ doc, page, preview, aspect, initialScale = 1, onClose }: {
  doc: PDFDocumentProxy | null; page: number; preview: string; aspect: number;
  initialScale?: number; onClose: () => void;
}) {
  const rootRef = useDialogFocus<HTMLDivElement>(true, onClose);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState(preview);
  const [ratio, setRatio] = useState(aspect);
  const [scale, setScale] = useState(initialScale);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const changeScale = (delta: number) => setScale(value => Math.max(1, Math.min(4, +(value + delta).toFixed(2))));

  useEffect(() => {
    if (!doc) { setImage(preview); setLoading(false); setFailed(false); return; }
    const controller = new AbortController();
    let ownedUrl: string | undefined;
    setLoading(true);
    setFailed(false);
    void renderPdfPage(doc, page, { scale: 2.6, quality: 0.9, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) {
        if (result?.url.startsWith('blob:')) URL.revokeObjectURL(result.url);
        return;
      }
      if (result) { ownedUrl = result.url; setImage(result.url); }
      else setFailed(true);
      setLoading(false);
    }).catch(() => {
      if (!controller.signal.aborted) { setFailed(true); setLoading(false); }
    });
    return () => {
      controller.abort();
      if (ownedUrl?.startsWith('blob:')) URL.revokeObjectURL(ownedUrl);
    };
  }, [doc, page, preview]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => setSize({ w: Math.max(1, node.clientWidth - 24), h: Math.max(1, node.clientHeight - 24) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeScale(-Math.sign(event.deltaY) * 0.25);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); node.removeEventListener('wheel', wheel); };
  }, []);

  const width = Math.min(size.w, size.h * ratio) * scale;
  const height = width / ratio;
  return (
    <div ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Page ${page} zoomed`}
      className="absolute inset-0 z-30 flex flex-col bg-white"
      onKeyDown={event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (['+', '=', '-', '_'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          changeScale(event.key === '+' || event.key === '=' ? 0.25 : -0.25);
        }
      }}>
      <div className="flex flex-wrap shrink-0 items-center justify-between gap-1 border-b border-ink/15 p-2">
        <span className="text-sm font-semibold">Page {page}</span>
        <div className="flex items-center gap-1">
          <button type="button" className="rounded-lg px-2 py-2 text-xs hover:bg-ink/5" onClick={() => setScale(1)}>Fit page</button>
          <button type="button" className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-30" disabled={scale <= 1} onClick={() => changeScale(-0.25)} aria-label="Zoom out"><ZoomOut size={18} /></button>
          <span className="w-10 text-center text-xs tabular-nums" role="status">{Math.round(scale * 100)}%</span>
          <button type="button" className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-30" disabled={scale >= 4} onClick={() => changeScale(0.25)} aria-label="Zoom in"><ZoomIn size={18} /></button>
          <button type="button" className="rounded-lg p-2 hover:bg-ink/5" onClick={onClose} aria-label="Close zoom"><X size={18} /></button>
        </div>
      </div>
      <div ref={scrollRef} data-zoom-scroll tabIndex={0} role="region" aria-label="Enlarged page scroll area" className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 nice-scroll" style={{ touchAction: 'pan-x pan-y pinch-zoom', scrollbarGutter: 'stable' }}>
        <div className="grid place-items-center" style={{ width: Math.max(size.w, width), minHeight: Math.max(size.h, height) }}>
          <img src={image} alt={`Page ${page} zoomed`} draggable={false} className="max-w-none object-contain shadow-lg"
            style={{ width, height }} onLoad={event => {
              const img = event.currentTarget;
              if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
            }} onDoubleClick={() => setScale(value => value > 1 ? 1 : 2)} />
        </div>
      </div>
      <p className="shrink-0 border-t border-ink/10 px-3 py-2 text-xs text-ink/60" role="status">
        {loading ? 'Loading a sharper image…' : failed ? 'High-resolution image unavailable. Showing the page preview.' : 'Scroll or swipe to move around. Double-click to zoom. Esc to close.'}
      </p>
    </div>
  );
}
