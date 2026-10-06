'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { PageFlip } from 'page-flip';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { easeOutQuint, springSoft } from './motion-tokens';
import { usePdfDoc } from '@/lib/use-pdf-doc';
import { usePdfPages } from './use-pdf-pages';
import { useElementSize } from './use-size';
import { playFlipSound } from './page-flip-sound';
import { useAutoFlip } from './use-auto-flip';
import { renderPdfPage } from './pdf-render';
import {
  Toolbar,
  ThumbsCloseButton,
  SearchPanel,
  TocPanel,
  Filmstrip,
} from './toolbar';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface FlipbookProps {
  pdfUrl: string;
  title: string;
  /** Edition id — used to persist the reader's last page (localStorage). */
  editionId?: string;
}

const LAST_PAGE_KEY = (id: string) => `highlander:lastpage:${id}`;

export function Flipbook({ pdfUrl, title, editionId }: FlipbookProps) {
  const { doc, loading, error: loadError, progress } = usePdfDoc(pdfUrl);
  const { pages, texts, aspect, error: renderError, ready } = usePdfPages(doc);
  const bookRef = useRef<{ pageFlip: () => PageFlip | undefined } | null>(null);
  const { w, h } = useElementSize('fb-wrap');
  const [page, setPage] = useState(1);
  // Mirror of `page` used to restore the position after the book remounts
  // (zoom / resize / orientation change recreate it starting at page 0).
  const pageRef = useRef(1);
  pageRef.current = page;
  const [zoom, setZoom] = useState(1);
  const [sound, setSound] = useState(false);
  const [thumbs, setThumbs] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flipping, setFlipping] = useState(false); // live spine: a turn is in progress
  const [jumpVeil, setJumpVeil] = useState(false); // ink veil on distant jumps (>2 pages)
  const veilTimerRef = useRef<number | null>(null);
  // Bottom page strip: persisted preference, loaded lazily on the first
  // client render so it never flashes open/closed and never persists the
  // default before reading the stored value.
  const [strip, setStrip] = useState(
    () => {
      try {
        return localStorage.getItem('highlander:strip') !== 'hidden';
      } catch {
        return true; // private mode / SSR — default visible
      }
    }
  );
  const [mounted, setMounted] = useState(false); // fade-in on ready
  const soundRef = useRef(false);
  soundRef.current = sound;

  const error = loadError ?? renderError;
  const isPortrait = w > 0 && w < 768;

  // ---- Deep link: read ?page=N once on mount -------------------------------
  const initialPageRef = useRef(1);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('page');
    const n = p ? parseInt(p, 10) : NaN;
    if (!Number.isNaN(n) && n >= 1) initialPageRef.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // When the book first becomes ready, open on the deep-linked page (or the
  // remembered last page of this edition when there is no ?page= param).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (error) setMounted(true); // never hide the error message behind the fade
  }, [error]);
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;
    const fromUrl = initialPageRef.current;
    const saved = editionId
      ? parseInt(localStorage.getItem(LAST_PAGE_KEY(editionId)) ?? '', 10)
      : NaN;
    const target = fromUrl > 1 ? fromUrl : !Number.isNaN(saved) && saved >= 1 ? saved : 1;
    if (target > 1) {
      initialPageRef.current = target;
      setPage(target);
    }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Persist last page per edition (throttled by flip events, cheap).
  useEffect(() => {
    if (!editionId || !ready) return;
    try {
      localStorage.setItem(LAST_PAGE_KEY(editionId), String(page));
    } catch {
      // private mode / quota — ignore
    }
  }, [page, editionId, ready]);

  // Persist the strip preference whenever it changes (the initial value is
  // read lazily in useState, so every run of this effect is a user change).
  useEffect(() => {
    try {
      localStorage.setItem('highlander:strip', strip ? 'shown' : 'hidden');
    } catch {
      // private mode / quota — ignore
    }
  }, [strip]);

  // ---- URL sync: replace ?page=N on every flip -----------------------------
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    window.history.replaceState(null, '', url.toString());
  }, [page, ready]);

  // ---- Derived helpers ------------------------------------------------------
  const goTo = useCallback(
    (n: number) => {
      if (navLockRef.current) return;
      const clamped = Math.max(1, Math.min(n, pages.length || 1));
      // Distant jumps get a quick ink veil so the instant swap reads as a
      // soft whoosh instead of a hard cut.
      if (Math.abs(clamped - pageRef.current) > 2) {
        setJumpVeil(true);
        if (veilTimerRef.current) window.clearTimeout(veilTimerRef.current);
        veilTimerRef.current = window.setTimeout(() => setJumpVeil(false), 260);
      }
      setPage(clamped);
      // Child index = PDF page - 1 in both orientations (showCover: child 0
      // is the cover; the rest pair into spreads).
      pf()?.turnToPage(clamped - 1);
      setThumbs(false);
      setSearchOpen(false);
      setTocOpen(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages.length]
  );

  // ---- Search over extracted text ------------------------------------------
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { page: number; snippet: string }[] = [];
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (!t) continue;
      const idx = t.toLowerCase().indexOf(q);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 34);
      const snippet = (start > 0 ? '…' : '') + t.slice(start, idx + q.length + 44).trim() + '…';
      out.push({ page: i + 1, snippet });
      if (out.length >= 24) break;
    }
    return out;
  }, [query, texts]);

  // ---- Table of contents (heuristic from page text) ------------------------
  // pdfjs flattens the text (no line breaks), so headline candidates are
  // recovered with regexes: ALL-CAPS runs, and Title-Case sequences that a
  // sentence would not contain (fallback: first ALL-CAPS run anywhere).
  const toc = useMemo(() => {
    const items: { page: number; title: string }[] = [];
    for (let i = 1; i < texts.length; i++) {
      const t = (texts[i] ?? '').trim();
      if (t.length < 4) continue;
      let title: string | null = null;
      const caps = t.match(/\b[A-Z][A-Z0-9'&-]+(?:\s+[A-Z0-9'&-]+){1,7}\b/);
      if (caps) {
        title = caps[0];
      } else {
        const tc = t.match(/\b(?:[A-Z][a-z'&-]+)(?:\s+(?:of|the|and|for|a|to)?\s*[A-Z][a-z'&-]+){1,4}\b/);
        if (tc) title = tc[0];
      }
      if (title && title.length >= 4 && title.length <= 60) {
        items.push({ page: i + 1, title });
      }
    }
    return items;
  }, [texts]);

  // ---- Zoom overlay (Google-Books style page view) --------------------------
  const [zoomPage, setZoomPage] = useState<{ n: number; url: string } | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });

  const openZoom = useCallback(
    async (n: number) => {
      if (!doc) return;
      setZoomPage({ n, url: pages[n - 1] ?? '' });
      setZoomScale(1);
      setZoomPan({ x: 0, y: 0 });
      setZoomLoading(true);
      const hi = await renderPdfPage(doc, n, { scale: 2.6, quality: 0.9 });
      if (hi) setZoomPage((cur) => (cur && cur.n === n ? { n, url: hi.url } : cur));
      setZoomLoading(false);
    },
    [doc, pages]
  );

  // Google-Books style: double-click / double-tap a page to open it big.
  const onBookDoubleClick = useCallback(
    (ev: React.MouseEvent) => {
      const img = (ev.target as HTMLElement).closest('img');
      if (!img) return;
      // The page children ARE <img class="stf__item"> elements in DOM order:
      // index i is PDF page i + 1 in BOTH orientations.
      const items = Array.from(document.querySelectorAll<HTMLImageElement>('img.stf__item'));
      const idx = items.indexOf(img as HTMLImageElement);
      if (idx === -1) return;
      void openZoom(idx + 1);
    },
    [isPortrait, openZoom]
  );

  const closeZoom = useCallback(() => {
    setZoomPage(null);
    setZoomScale(1);
    setZoomPan({ x: 0, y: 0 });
  }, []);

  // ---- Page size -------------------------------------------------------------
  const getPageWidth = () => {
    if (!aspect || w <= 0 || h <= 0) return 0;
    const pad = 24; // matches the p-3 wrapper
    // In landscape the book is two pages side by side; each page gets half the width.
    const maxPageW = (isPortrait ? w - pad : (w - pad) / 2) * zoom;
    const maxPageH = (h - pad) * zoom;
    // The binding constraint decides: too wide -> shrink to fit height, too tall -> shrink to fit width.
    const fitted = Math.min(maxPageW, maxPageH * aspect);
    return Math.max(180, Math.round(fitted));
  };
  // Keep one stable page size for the whole book so the cover uses the same
  // page-flip animation and does not remount when opening.
  const pageW = getPageWidth();
  const pageH = aspect ? Math.max(240, Math.round(pageW / aspect)) : 0;

  const onFlip = useCallback(
    (e: { data: number }) => {
      // Child index N = PDF page N + 1 in both orientations (no bookend
      // ghosts; the cover is child 0).
      setPage(e.data + 1);
      if (soundRef.current) playFlipSound();
    },
    []
  );

  // Freeze the children: react-pageflip re-clones its children and re-runs
  // updateFromHtml (which restructures the DOM) whenever props.children
  // changes IDENTITY. Recreating them on every render (page flips, toolbar
  // toggles) makes React fight the library's DOM surgery and crashes with
  // "insertBefore NotFoundError". Memoized, they are processed exactly once
  // per mount; zoom/resize/orientation remount the book via the key instead.
  // Children are ONLY the real page images, in both orientations. No bookend
  // ghost pages: with showCover, page-flip itself keeps the cover alone on
  // the right (closed newspaper) and the last page alone on the left, so
  // every element revealed during any flip carries real page content.
  const bookChildren = useMemo(
    () =>
      pages.map((src, i) => (
        <img
          key={`p-${i}`}
          src={src}
          alt={`Page ${i + 1}`}
          className="w-full h-full object-contain bg-white"
          draggable={false}
        />
      )),
    [pages]
  );

  const pf = () => bookRef.current?.pageFlip();

  const prev = useCallback(() => {
    if (navLockRef.current) return;
    pf()?.flipPrev();
  }, []);
  const next = useCallback(() => {
    if (navLockRef.current) return;
    pf()?.flipNext();
  }, []);

  // When the book (re)mounts — first load and every zoom/resize/orientation
  // change, which recreate it via the key — restore the reader's position.
  // onInit fires after page-flip has created the instance and loaded the
  // pages, so turnToPage lands reliably (unlike rAF after render).
  const onInit = useCallback(() => {
    const p = pageRef.current;
    if (p > 1) {
      requestAnimationFrame(() => pf()?.turnToPage(p - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frozen-fold fix: page-flip leaves the fold hanging mid-air when an
  // animation is interrupted (fast clicks, thumbnail jump while flipping).
  // 1) Nav lock: ignore navigation while a flip animation is running.
  // 2) Watchdog: if "flipping" outlives flippingTime + margin, remount the
  //    book cleanly (bump bookEpoch -> new key) — onInit restores the page.
  const navLockRef = useRef(false);
  const flipWatchRef = useRef<number | null>(null);
  const [bookEpoch, setBookEpoch] = useState(0);

  const onChangeState = useCallback((e: { data: string }) => {
    // Lomo vivo: deepen the spine shading while a sheet is in motion.
    setFlipping(e?.data === 'flipping' || e?.data === 'user_fold');
    if (e?.data === 'read') {
      navLockRef.current = false;
      if (flipWatchRef.current !== null) {
        window.clearTimeout(flipWatchRef.current);
        flipWatchRef.current = null;
      }
    } else if (e?.data === 'flipping') {
      navLockRef.current = true;
      if (flipWatchRef.current !== null) window.clearTimeout(flipWatchRef.current);
      flipWatchRef.current = window.setTimeout(() => {
        navLockRef.current = false;
        flipWatchRef.current = null;
        setBookEpoch((k) => k + 1); // heal the frozen fold
      }, 1400);
    }
  }, []);

  useEffect(
    () => () => {
      if (flipWatchRef.current !== null) window.clearTimeout(flipWatchRef.current);
      if (veilTimerRef.current !== null) window.clearTimeout(veilTimerRef.current);
    },
    []
  );

  // ---- Keyboard shortcuts (ignored while typing in inputs) ------------------
  const toggleFullscreen = () => {
    const el = document.getElementById('fb-wrap');
    if (!document.fullscreenElement) void el?.requestFullscreen?.();
    else void document.exitFullscreen();
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      switch (ev.key) {
        case 'ArrowLeft':
          prev();
          break;
        case 'ArrowRight':
          next();
          break;
        case 'Home':
          ev.preventDefault();
          goTo(1);
          break;
        case 'End':
          ev.preventDefault();
          goTo(pages.length || 1);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case '+':
        case '=':
          setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)));
          break;
        case '-':
        case '_':
          setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)));
          break;
        case 'g':
        case 'G':
          setThumbs((t) => !t);
          break;
        case 't':
        case 'T':
          setTocOpen((t) => !t);
          break;
        case 's':
        case 'S':
          setSearchOpen((s) => !s);
          break;
        case 'p':
        case 'P':
          setPlaying((v) => !v);
          break;
        case 'Escape':
          if (zoomPage) closeZoom();
          else if (searchOpen) setSearchOpen(false);
          else if (tocOpen) setTocOpen(false);
          else if (thumbs) setThumbs(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, goTo, pages.length, zoomPage, searchOpen, tocOpen, thumbs, closeZoom]);

  // ---- Auto-play (lobby screen) ---------------------------------------------
  useAutoFlip(playing, 9000, () => {
    if (pageRef.current >= (pages.length || 1)) {
      goTo(1); // loop
    } else {
      next();
    }
  });

  // Pause auto-play whenever the reader interacts manually.
  useEffect(() => {
    if (!playing) return;
    const stop = () => setPlaying(false);
    const wrap = document.getElementById('fb-wrap');
    wrap?.addEventListener('mousedown', stop);
    return () => wrap?.removeEventListener('mousedown', stop);
  }, [playing]);

  // ---- Copy link to this page -----------------------------------------------
  const copyLink = useCallback(async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(pageRef.current));
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — nothing we can do
    }
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <div
      id="fb-wrap"
      data-lg-surface
      className="lg-glass relative w-full h-[80vh] min-h-[440px] rounded-2xl overflow-hidden select-none"
    >
      {/* Soft vignette + stronger spine shadow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }}
      />

      {/* Keep the central spine overlay out of the way of the turning sheet. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-4 bottom-4 left-1/2 w-8 z-[6]"
        style={{
          x: '-50%',
          background:
            'linear-gradient(90deg, transparent, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.28) 55%, transparent)',
        }}
        initial={false}
        animate={{ opacity: flipping ? 0 : 0.12, scaleX: 1 }}
        transition={{ duration: 0.35 }}
      />

      {/* Reading progress hairline across the top of the reader */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 z-[6] h-[3px] bg-paper/10"
      >
        <motion.div
          className="h-full bg-accent origin-left"
          initial={false}
          animate={{ scaleX: pages.length ? page / pages.length : 0 }}
          transition={springSoft}
        />
      </div>

      {/* Ink veil for distant jumps */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[7] bg-ink"
        initial={false}
        animate={{ opacity: jumpVeil ? 0.5 : 0 }}
        transition={{ duration: 0.24 }}
      />

      <Toolbar
        page={page}
        pageCount={pages.length || 1}
        onPrev={prev}
        onNext={next}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}
        sound={sound}
        onToggleSound={() => setSound((s) => !s)}
        onToggleThumbs={() => setThumbs((t) => !t)}
        onToggleToc={() => {
          setTocOpen((t) => !t);
          setSearchOpen(false);
        }}
        tocOpen={tocOpen}
        onToggleSearch={() => {
          setSearchOpen((s) => !s);
          setTocOpen(false);
        }}
        searchOpen={searchOpen}
        playing={playing}
        onTogglePlay={() => setPlaying((v) => !v)}
        strip={strip}
        onToggleStrip={() => setStrip((s) => !s)}
        onCopyLink={copyLink}
        copied={copied}
        onFullscreen={toggleFullscreen}
      />

      <div className="w-full h-full flex items-center justify-center p-3">
        {error && <p className="text-paper/80">{error}</p>}
        {!error && !ready && (
          // Solid backing instead of its own filter: a backdrop-filter nested in
          // the glass visor would only re-blur the tint it already sits on.
          <div className="text-center w-72 rounded-2xl border border-paper/10 bg-ink/30 px-6 py-5">
            <p className="text-paper/70 animate-pulse mb-2">
              {progress !== null && progress < 1
                ? `Downloading… ${Math.round(progress * 100)}%`
                : loading || pages.length === 0
                  ? 'Loading the newspaper…'
                  : `Rendering pages… ${pages.length}/${doc?.numPages ?? '?'}`}
            </p>
            {progress !== null && progress < 1 && (
              <div className="h-1.5 rounded-full bg-paper/15 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
        {ready && (
          <motion.div
            onDoubleClick={onBookDoubleClick}
            initial={false}
            animate={mounted ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.965 }}
            transition={{ opacity: { duration: 0.6 }, scale: easeOutQuint }}
            style={{ transformOrigin: '50% 100%' }}
          >
          <HTMLFlipBook
            key={`${pageW}x${pageH}x${isPortrait}x${bookEpoch}`}
            ref={bookRef}
            className=""
            style={{}}
            width={pageW}
            height={pageH}
            size="fixed"
            startPage={0}
            minWidth={180}
            maxWidth={2000}
            minHeight={240}
            maxHeight={2000}
            startZIndex={2}
            autoSize
            mobileScrollSupport
            clickEventForward
            useMouseEvents
            showPageCorners
            disableFlipByClick={false}
            showCover={true}
            usePortrait={isPortrait}
            drawShadow
            flippingTime={600}
            maxShadowOpacity={0.5}
            swipeDistance={20}
            onFlip={onFlip}
            onInit={onInit}
            onChangeState={onChangeState}
          >
            {/* showCover keeps the cover alone on the right (closed
                newspaper) natively — no bookend pages, so everything
                revealed mid-flip is a real page image. */}
            {bookChildren}
          </HTMLFlipBook>
          </motion.div>
        )}
      </div>

      <AnimatePresence>{searchOpen && (
        <SearchPanel
          results={searchResults}
          query={query}
          onQueryChange={setQuery}
          onClose={() => setSearchOpen(false)}
          onGo={goTo}
        />
      )}</AnimatePresence>

      <AnimatePresence>{tocOpen && (
        <TocPanel items={toc} onClose={() => setTocOpen(false)} onGo={goTo} />
      )}</AnimatePresence>

      <AnimatePresence>
        {thumbs && pages.length > 0 && (
        <motion.div
          key="thumbs"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0, transition: springSoft }}
          exit={{ opacity: 0, y: 40, transition: { duration: 0.22, ease: 'easeIn' } }}
          className="absolute inset-0 z-20 bg-ink/95 pt-14 pb-4 px-4 overflow-auto nice-scroll"
        >
          <ThumbsCloseButton onClick={() => setThumbs(false)} />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-w-4xl mx-auto">
            {pages.map((src, i) => (
              <button key={i} onClick={() => goTo(i + 1)} className="group">
                <img
                  src={src}
                  alt={`Thumbnail ${i + 1}`}
                  className="w-full rounded shadow group-hover:ring-2 group-hover:ring-accent"
                />
                <p className="text-paper/70 text-xs text-center mt-1">{i + 1}</p>
              </button>
            ))}
          </div>
        </motion.div>
        )}
      </AnimatePresence>

      {/* Filmstrip (toggleable from the toolbar; hidden while panels are open) */}
      <AnimatePresence>
        {strip && !thumbs && !searchOpen && !tocOpen && pages.length > 2 && (
          <Filmstrip key="filmstrip" pages={pages} page={page} onGo={goTo} />
        )}
      </AnimatePresence>

      {/* Google-Books style zoom overlay */}
      <AnimatePresence>
        {zoomPage && (
        <motion.div
          key="zoom"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.22 } }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          className="absolute inset-0 z-30 bg-ink/97 flex items-center justify-center touch-none"
          onDoubleClick={() => closeZoom()}
        >
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <button
              className="p-2 rounded-lg text-paper/90 hover:bg-paper/15"
              onClick={() => setZoomScale((s) => Math.min(4, +(s + 0.5).toFixed(1)))}
              aria-label="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
            <span className="text-paper/70 text-xs tabular-nums w-10 text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              className="p-2 rounded-lg text-paper/90 hover:bg-paper/15"
              onClick={() => setZoomScale((s) => Math.max(0.5, +(s - 0.5).toFixed(1)))}
              aria-label="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
            <button
              className="p-2 rounded-lg text-paper/90 hover:bg-paper/15"
              onClick={closeZoom}
              aria-label="Close zoom"
            >
              <X size={18} />
            </button>
          </div>
          <div
            className="overflow-auto nice-scroll max-w-full max-h-full p-4"
            style={{ cursor: zoomScale > 1 ? 'grab' : 'default' }}
            onDoubleClick={() => setZoomScale((s) => (s > 1 ? 1 : 2))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomPage.url}
              alt={`Page ${zoomPage.n} zoomed`}
              draggable={false}
              className="max-w-none shadow-2xl"
              style={{
                transform: `scale(${zoomScale}) translate(${zoomPan.x}px, ${zoomPan.y}px)`,
                transformOrigin: 'top left',
              }}
              onWheel={(e) => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                setZoomScale((s) => Math.min(4, Math.max(0.5, +(s - Math.sign(e.deltaY) * 0.25).toFixed(2))));
              }}
            />
          </div>
          {zoomLoading && (
            <p className="absolute bottom-4 text-paper/70 text-xs animate-pulse">Loading hi-res…</p>
          )}
          <p className="absolute top-3 left-3 text-paper/60 text-xs">
            Page {zoomPage.n} · double-click to toggle zoom · Ctrl+scroll to zoom · Esc to close
          </p>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
