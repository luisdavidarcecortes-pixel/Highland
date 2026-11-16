'use client';

import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import type { PageFlip } from 'page-flip';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { springSoft } from './motion-tokens';
import { usePdfDoc } from '@/lib/use-pdf-doc';
import { usePdfPages } from './use-pdf-pages';
import { usePreparedPages } from './use-prepared-pages';
import { useElementSize } from './use-size';
import { playFlipSound } from './page-flip-sound';
import { useAutoFlip } from './use-auto-flip';
import { PageZoom } from './page-zoom';
import { clampPage, initialReaderPage, LAST_PAGE_KEY, visiblePageRange } from './reader-state';
import {
  Toolbar,
  ThumbsPanel,
  SearchPanel,
  TocPanel,
  Filmstrip,
} from './toolbar';
import { SlowVideo } from '@/components/slow-video';

interface FlipbookProps {
  pdfUrl: string;
  title: string;
  /** Edition id — used to persist the reader's last page (localStorage). */
  editionId?: string;
}

type BookHandle = { pageFlip: () => PageFlip | undefined };

const PageSources = createContext<string[]>([]);
const BookPage = forwardRef<HTMLDivElement, { n: number }>(function BookPage({ n }, ref) {
  const sources = useContext(PageSources);
  return <div ref={ref} data-pdf-page={n} className="bg-white"><img src={sources[n - 1]} alt={`Page ${n}`} className="w-full h-full object-contain" draggable={false} decoding="async" /></div>;
});

/**
 * The page-flip book, plus the teardown react-pageflip does not do.
 *
 * page-flip attaches window resize/mouse/touch listeners that only
 * `PageFlip.destroy()` removes. The reader remounts this component whenever
 * the page size changes (resize, orientation, watchdog heal)
 * because its key encodes them, so without this each remount would leak a
 * whole book plus its page images.
 */
function BookView({
  bookRef,
  width,
  height,
  isPortrait,
  onFlip,
  onInit,
  onChangeState,
  children,
}: {
  bookRef: React.MutableRefObject<BookHandle | null>;
  width: number;
  height: number;
  isPortrait: boolean;
  onFlip: (e: { data: number }) => void;
  onInit: () => void;
  onChangeState: (e: { data: string }) => void;
  children: React.ReactNode;
}) {
  const instance = useRef<PageFlip | null>(null);

  useEffect(() => {
    return () => {
      try {
        instance.current?.destroy();
      } catch {
        // The DOM may already be detached: destroying is best-effort.
      }
      instance.current = null;
    };
  }, []);

  return (
    <HTMLFlipBook
      ref={bookRef}
      className=""
      style={{}}
      width={width}
      height={height}
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
      disableFlipByClick={true}
      showCover={true}
      usePortrait={isPortrait}
      drawShadow
      flippingTime={750}
      maxShadowOpacity={0.5}
      swipeDistance={20}
      onFlip={onFlip}
      onInit={() => {
        instance.current = bookRef.current?.pageFlip() ?? null;
        onInit();
      }}
      onChangeState={onChangeState}
    >
      {children}
    </HTMLFlipBook>
  );
}

export function Flipbook({ pdfUrl, title, editionId }: FlipbookProps) {
  const [page, setPage] = useState(() => {
    let saved = null;
    try { if (editionId) saved = localStorage.getItem(LAST_PAGE_KEY(editionId)); } catch { /* Storage is optional. */ }
    return initialReaderPage(typeof window === 'undefined' ? '' : window.location.search, saved);
  });
  const prepared = usePreparedPages(editionId, pdfUrl);
  const usePreviews = !prepared.failed;
  const { doc, loading, error: loadError, progress, retry } = usePdfDoc(usePreviews ? null : pdfUrl);
  const rendered = usePdfPages(doc, page);
  const { pages, texts, aspect, error: renderError, ready, numPages, completed, failedPages, retry: retryPages } = usePreviews ? prepared.result : rendered;
  const bookRef = useRef<{ pageFlip: () => PageFlip | undefined } | null>(null);
  const { w, h } = useElementSize('fb-wrap');
  // Mirror of `page` used to restore the position after the book remounts
  // (resize / orientation change recreate it starting at page 0).
  const pageRef = useRef(1);
  pageRef.current = numPages > 0 ? clampPage(page, numPages) : page;
  const [sound, setSound] = useState(false);
  const [thumbs, setThumbs] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [jumpVeil, setJumpVeil] = useState(false); // white veil on distant jumps (>2 pages)
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
  const soundRef = useRef(false);
  soundRef.current = sound;

  const error = loadError ?? renderError;
  const isPortrait = w > 0 && w < 768;
  const visible = visiblePageRange(page, numPages || 1, isPortrait);
  useEffect(() => {
    if (numPages > 0) setPage(value => clampPage(value, numPages));
  }, [numPages]);

  // Persist last page per edition (throttled by flip events, cheap).
  useEffect(() => {
    if (!editionId || !ready || page > numPages) return;
    try {
      localStorage.setItem(LAST_PAGE_KEY(editionId), String(page));
    } catch {
      // private mode / quota — ignore
    }
  }, [page, editionId, ready, numPages]);

  // Persist the strip preference whenever it changes (the initial value is
  // read lazily in useState, so every run of this effect is a user change).
  useEffect(() => {
    try {
      localStorage.setItem('highlander:strip', strip ? 'shown' : 'hidden');
    } catch {
      // private mode / quota — ignore
    }
  }, [strip]);

  // ---- URL sync: replace ?page=N, but not on every single frame -------------
  useEffect(() => {
    if (!ready || page > numPages) return;
    // Next patches history.replaceState and dispatches a router update for each
    // call, so the URL is written once the page settles instead of on every
    // intermediate frame of a fast flip.
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (page > 1) url.searchParams.set('page', String(page));
      else url.searchParams.delete('page');
      window.history.replaceState(window.history.state, '', url.toString());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [page, ready, numPages]);

  // ---- Derived helpers ------------------------------------------------------
  const goTo = useCallback(
    (n: number) => {
      if (navLockRef.current) return;
      const clamped = clampPage(n, pages.length || 1);
      // Distant jumps get a quick ink veil so the instant swap reads as a
      // soft whoosh instead of a hard cut.
      if (Math.abs(clamped - pageRef.current) > 2) {
        setJumpVeil(true);
        if (veilTimerRef.current) window.clearTimeout(veilTimerRef.current);
        veilTimerRef.current = window.setTimeout(() => setJumpVeil(false), 420);
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
  const [zoomPage, setZoomPage] = useState<{ n: number; scale: number } | null>(null);
  const openZoom = useCallback((n: number, scale = 1) => {
    if (!ready) return;
    setPlaying(false);
    setZoomPage({ n: clampPage(n, numPages), scale });
  }, [numPages, ready]);

  // Google-Books style: double-click / double-tap a page to open it big.
  const onBookDoubleClick = useCallback(
    (ev: React.MouseEvent) => {
      const item = (ev.target as HTMLElement).closest<HTMLElement>('[data-pdf-page]');
      if (item) void openZoom(Number(item.dataset.pdfPage));
    },
    [openZoom]
  );

  const closeZoom = useCallback(() => {
    setZoomPage(null);
  }, []);

  // ---- Page size -------------------------------------------------------------
  const getPageWidth = () => {
    if (!aspect || w <= 0 || h <= 0) return 0;
    const pageTopInset = 56; // keep the page clear of the toolbar
    const pageBottomInset = strip && pages.length > 2 ? 96 : 12;
    // In landscape the book is two pages side by side; each page gets half the width.
    const maxPageW = isPortrait ? w - 24 : (w - 24) / 2;
    const maxPageH = h - pageTopInset - pageBottomInset;
    // The binding constraint decides: too wide -> shrink to fit height, too tall -> shrink to fit width.
    const fitted = Math.min(maxPageW, maxPageH * aspect);
    return Math.max(180, Math.round(fitted));
  };
  // Keep one stable page size for the whole book so the cover uses the same
  // page-flip animation and does not remount when opening.
  const pageW = getPageWidth();
  const pageH = aspect ? Math.max(240, Math.round(pageW / aspect)) : 0;

  const navLockRef = useRef(false);
  const flipWatchRef = useRef<number | null>(null);
  const [bookEpoch, setBookEpoch] = useState(0);

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
  // per mount; resize/orientation remount the book via the key instead.
  // Children are ONLY the real page images, in both orientations. No bookend
  // ghost pages: with showCover, page-flip itself keeps the cover alone on
  // the right (closed newspaper) and the last page alone on the left, so
  // every element revealed during any flip carries real page content.
  const bookChildren = useMemo(
    () =>
      Array.from({ length: numPages }, (_, i) => <BookPage key={`p-${i}`} n={i + 1} />),
    [numPages]
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

  // When the book (re)mounts — first load and every resize/orientation
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
  const onChangeState = useCallback((e: { data: string }) => {
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
      }, 4000);
    }
  }, []);

  useEffect(
    () => () => {
      if (flipWatchRef.current !== null) window.clearTimeout(flipWatchRef.current);
      if (veilTimerRef.current !== null) window.clearTimeout(veilTimerRef.current);
      clearTimeout(copyTimerRef.current);
    },
    []
  );

  // ---- Keyboard shortcuts (ignored while typing in inputs) ------------------
  const toggleFullscreen = async () => {
    const el = document.getElementById('fb-wrap');
    try {
      if (!document.fullscreenElement && el?.requestFullscreen) await el.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
      else setNotice('Fullscreen is unavailable in this browser. You can enlarge a page with Zoom.');
    } catch { setNotice('Fullscreen could not be opened. You can enlarge a page with Zoom.'); }
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // The zoom overlay is modal: only it reacts while it is open, so the
      // book cannot silently flip behind the page the reader is inspecting.
      if (zoomPage || !ready || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;

      // Search, contents and thumbnails are modal dialogs: they own the
      // keyboard while open. Without this guard, an arrow key pressed on a
      // result button flipped the book behind the panel.
      if (searchOpen || tocOpen || thumbs) return;

      const el = ev.target as HTMLElement | null;
      const isTyping =
        !!el && (el.matches('input, textarea, select') || el.isContentEditable || !!el.closest('[contenteditable="true"], [role="dialog"]'));
      if (isTyping || (el && el !== document.body && !el.closest('#fb-wrap'))) return;
      const shortcuts = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'f', 'F', '+', '=', '-', '_', 'g', 'G', 't', 'T', 's', 'S', 'p', 'P'];
      if (!shortcuts.includes(ev.key) || ev.repeat) return;
      ev.preventDefault();
      if (ev.key.toLowerCase() !== 'p') setPlaying(false);

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
          openZoom(pageRef.current, 1.5);
          break;
        case '-':
        case '_':
          openZoom(pageRef.current);
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, goTo, pages.length, zoomPage, searchOpen, tocOpen, thumbs, ready, openZoom]);

  // ---- Auto-play (lobby screen) ---------------------------------------------
  useAutoFlip(playing && ready && !zoomPage && !searchOpen && !tocOpen && !thumbs, 9000, () => {
    if (visiblePageRange(pageRef.current, pages.length || 1, isPortrait).last >= pages.length) {
      goTo(1); // loop
    } else {
      next();
    }
  });

  // Pause auto-play whenever the reader interacts manually.
  useEffect(() => {
    if (!playing) return;
    const stop = (event: PointerEvent) => {
      // Do not switch the play toggle twice (pointer-down then click).
      if (!(event.target instanceof Element && event.target.closest('[data-autoplay-toggle]'))) setPlaying(false);
    };
    const wrap = document.getElementById('fb-wrap');
    wrap?.addEventListener('pointerdown', stop);
    return () => wrap?.removeEventListener('pointerdown', stop);
  }, [playing]);

  // ---- Copy link to this page -----------------------------------------------
  const copyLink = useCallback(async () => {
    try {
      const url = new URL(window.location.href);
      if (editionId) url.pathname = `/read/${editionId}`;
      url.searchParams.set('page', String(pageRef.current));
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setNotice('The link could not be copied. You can copy the page address from your browser.');
    }
  }, [editionId]);

  return (
    <MotionConfig reducedMotion="user">
    <PageSources.Provider value={pages}>
    <div
      id="fb-wrap"
      data-rendered-pages={completed}
      data-page-count={numPages}
      role="region"
      aria-label={`${title} — issue reader`}
      aria-busy={!ready && !error}
      className="relative w-full h-[80vh] min-h-[440px] rounded-2xl overflow-hidden select-none border border-ink/15 bg-transparent"
    >
      {ready && <SlowVideo
        src="/bg/595873_Drone_Landscape_Nature_1280x720.mp4"
        poster="/bg/595873_Drone_Landscape_Nature_1280x720.jpg"
      />}
      <div className="absolute inset-0 z-0 bg-black/45" />
      {/* Reading progress hairline across the top of the reader */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 z-[6] h-[3px] bg-ink/10"
      >
        <motion.div
          className="h-full bg-accent origin-left"
          initial={false}
          animate={{ scaleX: numPages ? visible.last / numPages : 0 }}
          transition={springSoft}
        />
      </div>

      {/* White veil for distant jumps */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[7] bg-white"
        initial={false}
        animate={{ opacity: jumpVeil ? 0.35 : 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      />

      <Toolbar
        page={visible.first}
        lastVisiblePage={visible.last}
        pageCount={numPages}
        ready={ready}
        onPrev={prev}
        onNext={next}
        onZoom={() => openZoom(page, 1)}
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

      <div
        className={`relative z-[1] w-full h-full flex items-center justify-center px-3 pt-14 ${
          strip && pages.length > 2 ? 'pb-24' : 'pb-3'
        }`}
      >
        {error && (
          <div
            role="alert"
            className="w-80 max-w-full rounded-2xl border border-ink/15 bg-white px-6 py-5 text-center"
          >
            <p className="text-ink/80 text-sm">{error}</p>
            <button
              type="button"
              onClick={loadError ? retry : retryPages}
              className="mt-3 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-paper hover:bg-brand-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Try again
            </button>
          </div>
        )}
        {!error && !ready && (
          <div className="text-center w-72 rounded-2xl border border-ink/15 bg-white px-6 py-5">
            <p className="text-ink/70 animate-pulse mb-2">
              {progress !== null && progress < 1
                ? `Downloading… ${Math.round(progress * 100)}%`
                : loading || pages.length === 0
                  ? 'Loading the newspaper…'
                  : `Preparing page ${page}…`}
            </p>
            {progress !== null && progress < 1 && (
              <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
        {ready && pageW > 0 && pageH > 0 && (
          <motion.div
            onDoubleClick={onBookDoubleClick}
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ opacity: { duration: 0.4 } }}
            style={{ transformOrigin: '50% 100%' }}
          >
          <BookView
            key={`${pageW}x${pageH}x${isPortrait}x${bookEpoch}`}
            bookRef={bookRef}
            width={pageW}
            height={pageH}
            isPortrait={isPortrait}
            onFlip={onFlip}
            onInit={onInit}
            onChangeState={onChangeState}
          >
            {/* showCover keeps the cover alone on the right (closed
                newspaper) natively — no bookend pages, so everything
                revealed mid-flip is a real page image. */}
            {bookChildren}
          </BookView>
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
          pending={completed < numPages}
          failed={failedPages.length > 0}
        />
      )}</AnimatePresence>

      <AnimatePresence>{tocOpen && (
        <TocPanel items={toc} pending={completed < numPages} onClose={() => setTocOpen(false)} onGo={goTo} />
      )}</AnimatePresence>

      <AnimatePresence>
        {thumbs && pages.length > 0 && (
          <ThumbsPanel
            key="thumbs"
            pages={pages}
            page={page}
            onClose={() => setThumbs(false)}
            onGo={goTo}
          />
        )}
      </AnimatePresence>

      {/* Filmstrip (toggleable from the toolbar; hidden while panels are open) */}
      <AnimatePresence>
        {strip && !thumbs && !searchOpen && !tocOpen && pages.length > 2 && (
          <Filmstrip key="filmstrip" pages={pages} page={visible.first} onGo={goTo} spread={!isPortrait} />
        )}
      </AnimatePresence>

      {zoomPage && (doc || usePreviews) && <PageZoom key={zoomPage.n} doc={doc} page={zoomPage.n} preview={pages[zoomPage.n - 1]} aspect={aspect || 0.75} initialScale={zoomPage.scale} onClose={closeZoom} />}
    </div>
    </PageSources.Provider>
    <div className="mt-4 rounded-xl border border-ink/15 bg-white p-4 text-sm">
      <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">Open or download the original PDF</a>
      {notice && <p role="status" className="mt-2">{notice}</p>}
      {failedPages.length > 0 && <p role="status" className="mt-2">Some pages could not be displayed. <button type="button" onClick={retryPages} className="font-semibold text-brand underline">Retry the pages</button> or use the original PDF.</p>}
      <details className="mt-3">
        <summary className="cursor-pointer font-semibold">Read page {page} as text</summary>
        <p className="mt-3 whitespace-pre-wrap leading-relaxed select-text">{texts[page - 1] || 'No selectable text is available on this page. Open the original PDF for other reading options.'}</p>
      </details>
    </div>
    </MotionConfig>
  );
}
