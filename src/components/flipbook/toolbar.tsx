'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Volume2,
  VolumeX,
  Grid3x3,
  Maximize,
  List,
  Play,
  Pause,
  Search,
  Link2,
  Check,
  X,
  PanelBottomClose,
  PanelBottomOpen,
  MoreHorizontal,
} from 'lucide-react';
import {
  staggerParent,
  itemFromTop,
  springFast,
  springSoft,
  panelIn,
  panelInLeft,
} from './motion-tokens';
import { useDialogFocus } from '@/lib/use-dialog-focus';

interface ToolbarProps {
  page: number;
  lastVisiblePage: number;
  pageCount: number;
  ready: boolean;
  strip: boolean;
  onToggleStrip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onZoom: () => void;
  sound: boolean;
  onToggleSound: () => void;
  onToggleThumbs: () => void;
  onToggleToc: () => void;
  tocOpen: boolean;
  onToggleSearch: () => void;
  searchOpen: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  onCopyLink: () => void;
  copied: boolean;
  onFullscreen: () => void;
}

const btn =
  'p-1.5 lg:p-2 rounded-lg text-ink/80 hover:bg-ink/5 transition-colors disabled:opacity-30';

/** Odometer-style page counter: digits slide vertically on change. */
function PageOdometer({ page, lastVisiblePage, pageCount }: { page: number; lastVisiblePage: number; pageCount: number }) {
  const label = pageCount === 0 ? '— / —' : `${page === lastVisiblePage ? page : `${page}–${lastVisiblePage}`} / ${pageCount}`;
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="text-ink/70 text-xs tabular-nums min-w-14 lg:min-w-20 text-center inline-flex justify-center"
    >
      <span className="relative inline-block">
        <span aria-hidden className="invisible">
          {label}
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={page}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={springFast}
            className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

export function Toolbar(p: ToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="absolute top-0 left-0 right-0 z-10 border-b border-ink/10 bg-[#ffffff]">
    <motion.div
      variants={staggerParent}
      initial="hidden"
      animate="show"
      className="p-1.5 lg:p-2"
    >
      <fieldset disabled={!p.ready} className="m-0 flex min-w-0 w-full items-center justify-between gap-1 border-0 p-0">
      <motion.div variants={itemFromTop} className="flex items-center gap-0.5 lg:gap-1">
        <button className={btn} onClick={p.onPrev} disabled={p.page <= 1} title="Previous page (←)" aria-label="Previous page">
          <ChevronLeft size={20} />
        </button>
        <PageOdometer page={p.page} lastVisiblePage={p.lastVisiblePage} pageCount={p.pageCount} />
        <button className={btn} onClick={p.onNext} disabled={p.lastVisiblePage >= p.pageCount} title="Next page (→)" aria-label="Next page">
          <ChevronRight size={20} />
        </button>
        <button
          className={`${btn} hidden sm:inline-flex`}
          data-autoplay-toggle
          onClick={p.onTogglePlay}
          title={p.playing ? 'Pause auto-play' : 'Auto-play (P)'}
          aria-label={p.playing ? 'Pause auto-play' : 'Auto-play'}
        >
          {p.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        {p.pageCount > 2 && (
          <button
            className={`${btn} hidden lg:inline-flex`}
            onClick={p.onToggleStrip}
            title={p.strip ? 'Hide page strip' : 'Show page strip'}
            aria-label={p.strip ? 'Hide page strip' : 'Show page strip'}
            aria-pressed={p.strip}
          >
            {p.strip ? <PanelBottomClose size={18} /> : <PanelBottomOpen size={18} />}
          </button>
        )}
      </motion.div>
      <motion.div variants={itemFromTop} className="flex items-center gap-0.5 lg:gap-1">
        <button className={`${btn} hidden lg:inline-flex`} onClick={p.onZoom} title="Enlarge page (+)" aria-label="Enlarge page"><ZoomIn size={18} /></button>
        <button className={btn} onClick={() => { setMoreOpen(false); p.onToggleSearch(); }} title="Search (S)" aria-label="Search" aria-pressed={p.searchOpen}>
          <Search size={18} />
        </button>
        <button className={btn} onClick={() => { setMoreOpen(false); p.onToggleToc(); }} title="Contents (T)" aria-label="Contents" aria-pressed={p.tocOpen}>
          <List size={18} />
        </button>
        <button className={`${btn} hidden lg:inline-flex`} onClick={p.onCopyLink} title="Copy link to this page" aria-label="Copy link to this page">
          {p.copied ? <Check size={18} className="text-emerald-400" /> : <Link2 size={18} />}
        </button>
        <button
          className={`${btn} hidden lg:inline-flex`}
          onClick={p.onToggleSound}
          title={p.sound ? 'Sound on' : 'Sound off'}
          aria-label="Page turn sound"
          aria-pressed={p.sound}
        >
          {p.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className={btn} onClick={() => { setMoreOpen(false); p.onToggleThumbs(); }} title="Thumbnails (G)" aria-label="Thumbnails">
          <Grid3x3 size={18} />
        </button>
        <button className={`${btn} hidden lg:inline-flex`} onClick={p.onFullscreen} title="Fullscreen (F)" aria-label="Fullscreen">
          <Maximize size={18} />
        </button>
        <button className={`${btn} lg:hidden`} onClick={() => setMoreOpen(value => !value)} aria-expanded={moreOpen} aria-label="More reader controls"><MoreHorizontal size={18} /></button>
      </motion.div>
      </fieldset>
    </motion.div>
    {moreOpen && <MoreControls {...p} onClose={() => setMoreOpen(false)} />}
    <span className="sr-only" role="status" aria-live="polite">
      {p.copied ? 'Link to this page copied' : ''}
    </span>
    </div>
  );
}

function MoreControls(p: ToolbarProps & { onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(true, p.onClose);
  const action = (fn: () => void) => () => { p.onClose(); fn(); };
  return <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="More reader controls"
    className="absolute right-2 top-full z-20 w-60 max-w-[calc(100%_-_1rem)] rounded-xl border border-ink/15 bg-white p-2 shadow-xl">
    <div className="mb-1 flex items-center justify-between px-2 text-xs font-semibold">Reader controls<button type="button" className={btn} onClick={p.onClose} aria-label="Close reader controls"><X size={18} /></button></div>
    <button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-ink/5" onClick={action(p.onZoom)}><ZoomIn size={18} />Enlarge page</button>
    <button type="button" data-autoplay-toggle className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-ink/5" onClick={action(p.onTogglePlay)}>{p.playing ? <Pause size={18} /> : <Play size={18} />}{p.playing ? 'Pause auto-play' : 'Auto-play'}</button>
    {p.pageCount > 2 && <button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-ink/5" onClick={action(p.onToggleStrip)}><PanelBottomOpen size={18} />{p.strip ? 'Hide page strip' : 'Show page strip'}</button>}
    <button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-ink/5" onClick={action(p.onCopyLink)}><Link2 size={18} />Copy link to this page</button>
    <button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-ink/5" aria-pressed={p.sound} onClick={p.onToggleSound}><Volume2 size={18} />Page turn sound</button>
    <button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-ink/5" onClick={action(p.onFullscreen)}><Maximize size={18} />Fullscreen</button>
  </div>;
}
export function ThumbsCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="absolute top-2 right-2 z-10 p-2 rounded-lg text-ink/80 hover:bg-ink/5"
      onClick={onClick}
      aria-label="Close thumbnails"
    >
      <X size={18} />
    </button>
  );
}

/** Bottom filmstrip: drag with inertia, auto-centers on the active page. */
export function Filmstrip({
  pages,
  page,
  onGo,
  spread = false,
}: {
  pages: string[];
  page: number;
  onGo: (n: number) => void;
  /** Landscape shows a two-page spread, so both halves are "current". */
  spread?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  const [bounds, setBounds] = useState({ left: 0, right: 0 });

  // Measure how far the row may travel, and keep it clamped on resize.
  useEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      const r = rowRef.current;
      if (!c || !r) return;
      const min = Math.min(0, c.clientWidth - r.scrollWidth);
      setBounds({ left: min, right: 0 });
      x.set(Math.max(min, Math.min(0, x.get()))); // re-clamp current position
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

  // Glide the active thumbnail to the center with the house spring.
  useEffect(() => {
    const c = containerRef.current;
    const r = rowRef.current;
    if (!c || !r) return;
    const el = r.querySelector<HTMLElement>('[data-current="true"]');
    if (!el) return;
    const target =      Math.max(
      bounds.left,
      Math.min(0, c.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2))
    );
    animate(x, target, springSoft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, bounds.left]);

  return (
    <motion.div
      ref={rootRef}
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      exit={{ y: 80, transition: { duration: 0.25, ease: 'easeIn' } }}
      transition={springSoft}
      className="absolute bottom-0 left-0 right-0 z-10 border-t border-ink/10 bg-[#ffffff] px-2 pt-2 pb-2"
    >
      <div ref={containerRef} className="overflow-hidden">
        <motion.div
          ref={rowRef}
          style={{ x }}
          drag="x"
          dragConstraints={bounds}
          dragElastic={0.06}
          dragMomentum
          className="flex gap-2 items-end cursor-grab active:cursor-grabbing"
        >
          {pages.map((src, i) => {
            const n = i + 1;
            const current = n === page || (spread && page > 1 && n === page + 1);
            return (
              <motion.button
                key={n}
                data-current={current}
                onClick={() => onGo(n)}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.95 }}
                className={`shrink-0 rounded overflow-hidden border-2 transition-colors ${
                  current ? 'border-accent' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                aria-label={`Go to page ${n}`}
              >
                <img src={src} alt={`Page ${n}`} className="h-16 w-auto" draggable={false} loading="lazy" decoding="async" />
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Search panel: floating box under the toolbar. */
export function SearchPanel({
  results,
  query,
  onQueryChange,
  onClose,
  onGo,
  pending = false,
  failed = false,
}: {
  results: { page: number; snippet: string }[];
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  onGo: (page: number) => void;
  pending?: boolean;
  failed?: boolean;
}) {
  const rootRef = useDialogFocus<HTMLDivElement>(true, onClose);

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search in the newspaper"
      tabIndex={-1}
      variants={panelIn}
      initial="hidden"
      animate="show"
      exit="exit"
      className="absolute top-12 left-1/2 -translate-x-1/2 z-20 w-[min(92%,26rem)] rounded-xl bg-[#ffffff] text-ink shadow-xl border border-ink/15 p-3"
    >
      <div className="flex items-center gap-2">
        <Search size={16} className="text-ink/50 shrink-0" />
        <input
          autoFocus
          aria-label="Search in the newspaper"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search in the newspaper…"
          className="min-w-0 flex-1 bg-transparent outline-none text-sm placeholder:text-ink/40"
        />
        <button className="p-1 rounded hover:bg-ink/5" onClick={onClose} aria-label="Close search">
          <X size={16} />
        </button>
      </div>
      {query.trim().length >= 2 && (
        <div className="mt-2 max-h-56 overflow-auto nice-scroll divide-y divide-ink/10">
          {pending && <p role="status" className="text-ink/60 text-xs px-1 py-2">Searching while the remaining pages load…</p>}
          {!pending && results.length === 0 && <p role="status" className="text-ink/50 text-xs px-1 py-2">{failed ? 'No matches in the available pages. Some pages need to be retried.' : 'No results.'}</p>}
          {results.map((r) => (
            <button
              key={r.page}
              onClick={() => onGo(r.page)}
              className="w-full text-left px-1 py-2 hover:bg-ink/5 rounded flex gap-2 items-start"
            >
              <span className="text-[10px] bg-ink/10 rounded px-1.5 py-0.5 tabular-nums shrink-0 mt-0.5">
                p.{r.page}
              </span>
              <span className="text-xs text-ink/75">{r.snippet}</span>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/** Table of contents panel: sections list that jumps to pages. */
export function TocPanel({
  items,
  onClose,
  onGo,
  pending = false,
}: {
  items: { page: number; title: string }[];
  onClose: () => void;
  onGo: (page: number) => void;
  pending?: boolean;
}) {
  const rootRef = useDialogFocus<HTMLDivElement>(true, onClose);

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Contents"
      tabIndex={-1}
      variants={panelInLeft}
      initial="hidden"
      animate="show"
      exit="exit"
      className="absolute top-12 left-3 z-20 w-[min(80%,16rem)] max-h-[70%] overflow-auto nice-scroll text-ink rounded-xl bg-[#ffffff] shadow-xl border border-ink/15 p-2"
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs font-semibold tracking-wide text-ink/60 uppercase">Contents</p>
        <button className="p-1 rounded hover:bg-ink/5" onClick={onClose} aria-label="Close contents">
          <X size={16} />
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-ink/50 text-xs px-1 pb-2">
          {pending ? 'Preparing the contents as pages load…' : 'No sections detected in this issue.'}
        </p>
      )}
      <ul>
        {items.map((it) => (
          <li key={it.page}>
            <button
              onClick={() => onGo(it.page)}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-ink/5 flex items-baseline gap-2"
            >
              <span className="text-[10px] bg-ink/10 rounded px-1.5 py-0.5 tabular-nums shrink-0">
                p.{it.page}
              </span>
              <span className="text-sm truncate">{it.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * Full-page thumbnail grid. It covers the reader, so it behaves like a modal:
 * focus is trapped inside and Escape closes it.
 */
export function ThumbsPanel({
  pages,
  page,
  onClose,
  onGo,
}: {
  pages: string[];
  page: number;
  onClose: () => void;
  onGo: (page: number) => void;
}) {
  const rootRef = useDialogFocus<HTMLDivElement>(true, onClose);

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Page thumbnails"
      tabIndex={-1}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0, transition: springSoft }}
      exit={{ opacity: 0, y: 40, transition: { duration: 0.22, ease: 'easeIn' } }}
      className="absolute inset-0 z-20 bg-[#ffffff] pt-14 pb-4 px-4 overflow-auto nice-scroll"
    >
      <ThumbsCloseButton onClick={onClose} />
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-w-4xl mx-auto">
        {pages.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onGo(i + 1)}
            aria-label={`Go to page ${i + 1}`}
            aria-current={page === i + 1 ? 'page' : undefined}
            className="group rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              className={`w-full rounded shadow group-hover:ring-2 group-hover:ring-accent ${
                page === i + 1 ? 'ring-2 ring-accent' : ''
              }`}
            />
            <p aria-hidden className="text-ink/60 text-xs text-center mt-1">
              {i + 1}
            </p>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
