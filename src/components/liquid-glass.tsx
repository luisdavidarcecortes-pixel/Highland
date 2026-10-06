'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { HOST_ID, acquireLens, releaseLens, supportsRefraction } from '@/lib/liquid-glass';

/**
 * Hidden host for the generated refraction filters. Mounted once in the root
 * layout; it must not be `display: none`, because a hidden subtree is not a
 * reliable filter source in every engine.
 */
export function LiquidGlassDefs() {
  return (
    <svg
      id={HOST_ID}
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    />
  );
}

type ElementTag = 'div' | 'header' | 'nav' | 'section' | 'aside';

interface RefractionOptions {
  /** Corner radius in px. Must match the element's CSS radius for a clean bevel. */
  radius?: number;
  /** Refracting bezel width in px; defaults to ~22% of the shortest side. */
  bezel?: number;
  /** Maximum pixel shift; defaults to a fraction of the bezel. */
  displacement?: number;
  /** Backdrop blur in px. Keep static and under 20px. */
  blur?: number;
  saturate?: number;
}

/**
 * Refracting surfaces are expensive: each one re-composites everything painted
 * behind it. Only the largest few visible surfaces get a lens; the rest keep
 * the frosted CSS rung, which this component never touches.
 */
const MAX_LENSES = 8;
/** Below this side length a bezel has nothing to bend; frosting only. */
const MIN_REFRACT_SIDE = 44;
export const DEFAULT_BLUR = 14;
export const DEFAULT_SATURATE = 180;

interface Candidate {
  el: HTMLElement;
  /** Higher wins the limited lens budget; the reader chrome uses 100. */
  priority: number;
  /** `data-lg-static` surfaces are registered but never refract. */
  allowRefract: boolean;
  /**
   * Registered by name rather than discovered. Chrome that the design stacks on
   * purpose — the reader toolbar over the glass visor — keeps its lens even
   * though it sits inside another glass surface.
   */
  explicit: boolean;
  /** Read the radius off the element instead of trusting the caller. */
  autoRadius: boolean;
  radius: number;
  bezel?: number;
  displacement?: number;
  blur: number;
  saturate: number;
  width: number;
  height: number;
  area: number;
  visible: boolean;
  lensId: string | null;
  appliedKey: string | null;
}

interface RegisterOptions extends RefractionOptions {
  priority?: number;
  allowRefract?: boolean;
  autoRadius?: boolean;
  explicit?: boolean;
}

interface LiquidGlassProps extends RefractionOptions {
  children: React.ReactNode;
  className?: string;
  /** Rendered element; defaults to a div. */
  as?: ElementTag;
  style?: React.CSSProperties;
}

const candidates = new Map<HTMLElement, Candidate>();
let rebalanceScheduled = false;

function readCssRadius(el: HTMLElement): number {
  const parsed = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 16;
}

function measure(candidate: Candidate) {
  const rect = candidate.el.getBoundingClientRect();
  candidate.width = Math.round(rect.width);
  candidate.height = Math.round(rect.height);
  candidate.area = candidate.width * candidate.height;
  if (candidate.autoRadius) candidate.radius = readCssRadius(candidate.el);
}

function specKey(candidate: Candidate): string {
  return [
    candidate.width,
    candidate.height,
    candidate.radius,
    candidate.bezel ?? 'auto',
    candidate.displacement ?? 'auto',
    candidate.blur,
    candidate.saturate,
  ].join(':');
}

function revoke(candidate: Candidate) {
  if (candidate.lensId) {
    releaseLens(candidate.lensId);
    candidate.lensId = null;
  }
  candidate.appliedKey = null;
  candidate.el.style.removeProperty('backdrop-filter');
  candidate.el.style.removeProperty('-webkit-backdrop-filter');
  candidate.el.removeAttribute('data-lg-refract');
}

function apply(candidate: Candidate) {
  const key = specKey(candidate);
  if (candidate.lensId && candidate.appliedKey === key) return;
  const next = acquireLens({
    width: candidate.width,
    height: candidate.height,
    radius: candidate.radius,
    bezel: candidate.bezel,
    displacement: candidate.displacement,
  });
  if (!next) return;
  if (candidate.lensId && candidate.lensId !== next) releaseLens(candidate.lensId);
  candidate.lensId = next;
  candidate.appliedKey = key;
  const value = `url(#${next}) blur(${candidate.blur}px) saturate(${candidate.saturate}%)`;
  candidate.el.style.setProperty('backdrop-filter', value);
  // Safari's -webkit- alias does not resolve custom properties, so the value is
  // written out in full for both declarations.
  candidate.el.style.setProperty('-webkit-backdrop-filter', value);
  candidate.el.setAttribute('data-lg-refract', 'on');
}

/**
 * A glass surface nested in another one already satisfies the eye: the inner
 * element is only frosting a tinted panel, so it buys nothing and costs a
 * second backdrop pass. Only the outermost rectangle refracts.
 */
function hasGlassAncestor(el: HTMLElement): boolean {
  let node = el.parentElement;
  while (node) {
    if (node.classList.contains('lg-glass') || node.hasAttribute('data-lg-refract')) return true;
    node = node.parentElement;
  }
  return false;
}

function rebalance() {
  rebalanceScheduled = false;
  const enabled = supportsRefraction();
  const list: Candidate[] = [];
  candidates.forEach((candidate, el) => {
    if (!el.isConnected) {
      revoke(candidate);
      candidates.delete(el);
      return;
    }
    list.push(candidate);
  });
  list.sort((a, b) => b.priority - a.priority || b.area - a.area);

  let used = 0;
  for (const candidate of list) {
    const eligible =
      enabled &&
      candidate.allowRefract &&
      candidate.visible &&
      candidate.area > 0 &&
      candidate.width >= MIN_REFRACT_SIDE &&
      candidate.height >= MIN_REFRACT_SIDE &&
      used < MAX_LENSES &&
      (candidate.explicit || !hasGlassAncestor(candidate.el));
    if (!eligible) {
      revoke(candidate);
      continue;
    }
    used += 1;
    apply(candidate);
  }
}

/**
 * Coalesces the bursts of work that one layout change produces.
 *
 * A timer rather than `requestAnimationFrame`: rAF is starved in a background
 * or throttled tab, and a surface that quietly never turns to glass is a much
 * worse bug than measuring one tick off the frame. Nothing here animates, so
 * there is no frame to line up with.
 */
function scheduleRebalance() {
  if (rebalanceScheduled) return;
  rebalanceScheduled = true;
  window.setTimeout(rebalance, 0);
}

/** Adds one surface to the budget and returns the cleanup that removes it. */
function registerCandidate(el: HTMLElement, options: RegisterOptions = {}): () => void {
  // StrictMode remounts run the cleanup first, so a live entry here would mean
  // a genuine double registration: keep the first and ignore the second.
  if (candidates.has(el)) return () => {};

  const {
    priority = 0,
    allowRefract = true,
    autoRadius = true,
    explicit = false,
    radius = 16,
    bezel,
    displacement,
    blur = DEFAULT_BLUR,
    saturate = DEFAULT_SATURATE,
  } = options;

  const candidate: Candidate = {
    el,
    priority,
    allowRefract,
    autoRadius,
    explicit,
    radius,
    bezel,
    displacement,
    blur,
    saturate,
    width: 0,
    height: 0,
    area: 0,
    visible: true,
    lensId: null,
    appliedKey: null,
  };

  candidates.set(el, candidate);
  measure(candidate);
  // The budget needs the whole picture, so a second pass runs once the sibling
  // surfaces of this commit have registered too.
  scheduleRebalance();

  return () => {
    if (candidates.get(el) !== candidate) return;
    candidates.delete(el);
    revoke(candidate);
    scheduleRebalance();
  };
}

/**
 * Real refraction (rung 3) for any element that owns its own markup — say a
 * `motion.div` that needs variants or drag. Registers the surface with the
 * budget at the highest priority, so page content can never crowd it out.
 *
 * Chromium only, applied from JS: Firefox resolves `url()` inside
 * `backdrop-filter` as valid, passes every `@supports` test and then paints
 * nothing. That is the one place a browser gate is genuinely the right tool.
 */
export function useRefraction(
  ref: React.RefObject<HTMLElement | null>,
  { radius = 16, bezel, displacement, blur = DEFAULT_BLUR, saturate = DEFAULT_SATURATE }: RefractionOptions = {},
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const stop = registerCandidate(el, {
      priority: 100,
      explicit: true,
      autoRadius: false,
      radius,
      bezel,
      displacement,
      blur,
      saturate,
    });

    const refresh = () => {
      const candidate = candidates.get(el);
      if (candidate) measure(candidate);
      scheduleRebalance();
    };

    const observer = new ResizeObserver(refresh);
    observer.observe(el);
    const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    transparency.addEventListener('change', refresh);

    return () => {
      observer.disconnect();
      transparency.removeEventListener('change', refresh);
      stop();
    };
  }, [ref, radius, bezel, displacement, blur, saturate]);
}

/**
 * A liquid glass chrome surface.
 *
 * Layered so nothing is ever unreadable or invisible:
 *  1. CSS base — an opaque tinted panel, used when there are no backdrop
 *     filters at all (this is the whole product for reduced-transparency users).
 *  2. CSS frosted glass — every engine that supports `backdrop-filter`.
 *  3. Real refraction — see `useRefraction` above.
 */
export function LiquidGlass({
  children,
  className = '',
  as: Tag = 'div',
  radius = 16,
  bezel,
  displacement,
  blur = DEFAULT_BLUR,
  saturate = DEFAULT_SATURATE,
  style,
}: LiquidGlassProps) {
  const ref = useRef<HTMLElement>(null);

  useRefraction(ref, { radius, bezel, displacement, blur, saturate });

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`lg-glass ${className}`}
      style={style}
    >
      {children}
    </Tag>
  );
}

/**
 * Enhances every server-rendered rectangle marked with `data-lg-surface`.
 *
 * The tint and the frost are pure CSS classes written in the JSX, so the glass
 * is visible in the very first paint and survives hydration; this component
 * only adds the third rung (real refraction) to the surfaces that earn it.
 * Add `data-lg-static` to small chrome that should stay frosted for good.
 */
export function GlassSurfaces() {
  useEffect(() => {
    const stops = new Map<HTMLElement, () => void>();

    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const candidate = candidates.get(entry.target as HTMLElement);
        if (candidate) measure(candidate);
      }
      scheduleRebalance();
    });

    // Off-screen surfaces are revoked: the budget is per screen, and a page of
    // two dozen cards must not hold two dozen live filters.
    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const candidate = candidates.get(entry.target as HTMLElement);
          if (candidate) candidate.visible = entry.isIntersecting;
        }
        scheduleRebalance();
      },
      { rootMargin: '160px 0px' },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>('[data-lg-surface]').forEach((el) => {
        if (stops.has(el)) return;
        stops.set(
          el,
          registerCandidate(el, { allowRefract: !el.hasAttribute('data-lg-static') }),
        );
        resize.observe(el);
        intersection.observe(el);
      });

      stops.forEach((stop, el) => {
        if (el.isConnected) return;
        stop();
        stops.delete(el);
      });
    };

    scan();

    // Panels open, lists re-render and the reader swaps pages: any surface that
    // appears later has to be picked up.
    let pending = false;
    const mutations = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      window.setTimeout(() => {
        pending = false;
        scan();
      }, 0);
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    transparency.addEventListener('change', scheduleRebalance);

    return () => {
      mutations.disconnect();
      resize.disconnect();
      intersection.disconnect();
      transparency.removeEventListener('change', scheduleRebalance);
      stops.forEach((stop) => stop());
      stops.clear();
    };
  }, []);

  return null;
}
