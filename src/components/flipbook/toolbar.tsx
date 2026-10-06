'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
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
} from 'lucide-react';
import {
  staggerParent,
  itemFromTop,
  springFast,
  springSoft,
  panelIn,
  panelInLeft,
} from './motion-tokens';
import { LiquidGlass, useRefraction } from '@/components/liquid-glass';

interface ToolbarProps {
  page: number;
  pageCount: number;
  strip: boolean;
  onToggleStrip: () => void;
  onPrev: () => void;
  onNext: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
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
  'p-2 rounded-lg text-paper/90 hover:bg-paper/15 transition-colors disabled:opacity-30';

/** Odometer-style page counter: digits slide vertically on change. */
function PageOdometer({ page, pageCount }: { page: number; pageCount: number }) {
  return (
    <span className="text-paper/90 text-xs tabular-nums min-w-20 text-center inline-flex justify-center">
      <span className="relative inline-block">
        <span aria-hidden className="invisible">
          {page} / {pageCount}
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
            {page} / {pageCount}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

export function Toolbar(p: ToolbarProps) {
  return (
    <LiquidGlass radius={0} className="lg-glass-dark absolute top-0 left-0 right-0 z-10">
    <motion.div
      variants={staggerParent}
      initial="hidden"
      animate="show"
      className="flex items-center justify-between gap-2 p-2 bg-gradient-to-b from-ink/80 to-transparent"
    >
      <motion.div variants={itemFromTop} className="flex items-center gap-1">
        <button className={btn} onClick={p.onPrev} disabled={p.page <= 1} title="Previous page (←)" aria-label="Previous page">
          <ChevronLeft size={20} />
        </button>
        <PageOdometer page={p.page} pageCount={p.pageCount} />
        <button className={btn} onClick={p.onNext} disabled={p.page >= p.pageCount} title="Next page (→)" aria-label="Next page">
          <ChevronRight size={20} />
        </button>
        <button
          className={btn}
          onClick={p.onTogglePlay}
          title={p.playing ? 'Pause auto-play' : 'Auto-play (P)'}
          aria-label={p.playing ? 'Pause auto-play' : 'Auto-play'}
        >
          {p.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        {p.pageCount > 2 && (
          <button
            className={btn}
            onClick={p.onToggleStrip}
            title={p.strip ? 'Hide page strip' : 'Show page strip'}
            aria-label={p.strip ? 'Hide page strip' : 'Show page strip'}
            aria-pressed={p.strip}
          >
            {p.strip ? <PanelBottomClose size={18} /> : <PanelBottomOpen size={18} />}
          </button>
        )}
      </motion.div>
      <motion.div variants={itemFromTop} className="flex items-center gap-1">
        <button
          className={btn}
          onClick={p.onZoomOut}
          disabled={p.zoom <= 0.6}
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          <ZoomOut size={18} />
        </button>
        <span className="text-paper/70 text-xs tabular-nums min-w-10 text-center" aria-live="polite">
          {Math.round(p.zoom * 100)}%
        </span>
        <button
          className={btn}
          onClick={p.onZoomIn}
          disabled={p.zoom >= 2}
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <ZoomIn size={18} />
        </button>
        <button className={btn} onClick={p.onToggleSearch} title="Search (S)" aria-label="Search" aria-pressed={p.searchOpen}>
          <Search size={18} />
        </button>
        <button className={btn} onClick={p.onToggleToc} title="Contents (T)" aria-label="Contents" aria-pressed={p.tocOpen}>
          <List size={18} />
        </button>
        <button className={btn} onClick={p.onCopyLink} title="Copy link to this page" aria-label="Copy link to this page">
          {p.copied ? <Check size={18} className="text-emerald-400" /> : <Link2 size={18} />}
        </button>
        <button className={btn} onClick={p.onToggleSound} title={p.sound ? 'Sound on' : 'Sound off'} aria-label="Page turn sound">
          {p.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className={btn} onClick={p.onToggleThumbs} title="Thumbnails (G)" aria-label="Thumbnails">
          <Grid3x3 size={18} />
        </button>
        <button className={btn} onClick={p.onFullscreen} title="Fullscreen (F)" aria-label="Fullscreen">
          <Maximize size={18} />
        </button>
      </motion.div>
    </motion.div>
    </LiquidGlass>
  );
}export function ThumbsCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="absolute top-2 right-2 z-10 p-2 rounded-lg text-paper/90 hover:bg-paper/15"
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
}: {
  pages: string[];
  page: number;
  onGo: (n: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  // Square edges on purpose: the strip spans the full width of the reader.
  useRefraction(rootRef, { radius: 0 });
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
      className="lg-glass lg-glass-dark absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-ink/95 to-ink/60 px-2 pt-2 pb-2"
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
            const current = n === page || n === page + 1;
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
                <img src={src} alt={`Page ${n}`} className="h-16 w-auto" draggable={false} />
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
}: {
  results: { page: number; snippet: string }[];
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  onGo: (page: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useRefraction(rootRef, { radius: 12 });

  return (
    <motion.div
      ref={rootRef}
      variants={panelIn}
      initial="hidden"
      animate="show"
      exit="exit"
      className="lg-glass lg-glass-dark absolute top-12 left-1/2 -translate-x-1/2 z-20 w-[min(92%,26rem)] text-paper rounded-xl shadow-page border border-paper/10 p-3"
    >
      <div className="flex items-center gap-2">
        <Search size={16} className="text-paper/60 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search in the newspaper…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-paper/40"
        />
        <button className="p-1 rounded hover:bg-paper/15" onClick={onClose} aria-label="Close search">
          <X size={16} />
        </button>
      </div>
      {query.trim().length >= 2 && (
        <div className="mt-2 max-h-56 overflow-auto nice-scroll divide-y divide-paper/10">
          {results.length === 0 && <p className="text-paper/60 text-xs px-1 py-2">No results.</p>}
          {results.slice(0, 20).map((r) => (
            <button
              key={r.page}
              onClick={() => onGo(r.page)}
              className="w-full text-left px-1 py-2 hover:bg-paper/10 rounded flex gap-2 items-start"
            >
              <span className="text-[10px] bg-paper/15 rounded px-1.5 py-0.5 tabular-nums shrink-0 mt-0.5">
                p.{r.page}
              </span>
              <span className="text-xs text-paper/85">{r.snippet}</span>
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
}: {
  items: { page: number; title: string }[];
  onClose: () => void;
  onGo: (page: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useRefraction(rootRef, { radius: 12 });

  return (
    <motion.div
      ref={rootRef}
      variants={panelInLeft}
      initial="hidden"
      animate="show"
      exit="exit"
      className="lg-glass lg-glass-dark absolute top-12 left-3 z-20 w-[min(80%,16rem)] max-h-[70%] overflow-auto nice-scroll text-paper rounded-xl shadow-page border border-paper/10 p-2"
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs font-semibold tracking-wide text-paper/70 uppercase">Contents</p>
        <button className="p-1 rounded hover:bg-paper/15" onClick={onClose} aria-label="Close contents">
          <X size={16} />
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-paper/60 text-xs px-1 pb-2">
          No sections detected in this issue.
        </p>
      )}
      <ul>
        {items.map((it) => (
          <li key={it.page}>
            <button
              onClick={() => onGo(it.page)}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-paper/10 flex items-baseline gap-2"
            >
              <span className="text-[10px] bg-paper/15 rounded px-1.5 py-0.5 tabular-nums shrink-0">
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
