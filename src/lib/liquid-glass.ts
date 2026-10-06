'use client';

/**
 * Refraction engine for the liquid glass surfaces.
 *
 * Real refraction in the browser is a Chromium-only trick: `backdrop-filter`
 * accepts an SVG filter reference and `feDisplacementMap` then bends the
 * backdrop pixels. Safari has an open bug for it and Firefox parses `url()` as
 * valid, passes `@supports`, and renders nothing at all — so this module never
 * relies on `@supports` and gates the effect on the engine instead.
 *
 * The bend comes from a displacement map generated with a canvas: the red
 * channel shifts pixels horizontally and the green one vertically, 128 meaning
 * "no shift". The field is built from Apple's squircle bezel profile
 * `h(x) = (1 - (1 - x)^4)^(1/4)`: the slope of that curve is steepest at the
 * outer edge and tapers to zero where the bezel meets the flat center, which
 * is exactly how real glass bends light near its rim and not in the middle.
 */

/** Distance samples across the bezel: 127 keeps us inside the map's 8-bit range. */
const SAMPLES = 127;
/** Longest side of the generated map; the field is smooth, so it upscales fine. */
const MAP_MAX_SIDE = 320;
/** Neutral value of a displacement channel. */
const NEUTRAL = 128;

export interface LensSpec {
  width: number;
  height: number;
  /** Corner radius in CSS pixels; must match the element's border radius. */
  radius: number;
  /** Width of the refracting bezel in CSS pixels. */
  bezel?: number;
  /** Maximum pixel shift, in CSS pixels. */
  displacement?: number;
}

interface LensRecord {
  id: string;
  refs: number;
}

const lenses = new Map<string, LensRecord>();
const keyByLensId = new Map<string, string>();
let serial = 0;

/**
 * True only where an SVG filter inside `backdrop-filter` actually renders.
 *
 * User-Agent Client Hints are implemented by Chromium-derived browsers alone,
 * which is a far safer signal than sniffing versions; the UA string is only a
 * fallback for insecure contexts, where `navigator.userAgentData` is hidden.
 * iOS Chrome reports `CriOS` and exposes no UA-CH, so it correctly opts out.
 */
export function supportsRefraction(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasClientHints = 'userAgentData' in navigator;
  const ua = navigator.userAgent;
  const chromiumUa = /Chrom(e|ium)\//.test(ua) && !/Firefox|FxiOS/.test(ua);
  if (!hasClientHints && !chromiumUa) return false;
  return !window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
}

/** Apple's squircle bevel: 0 at the outer edge, 1 where the flat center starts. */
function bezelHeight(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return Math.pow(1 - Math.pow(1 - t, 4), 0.25);
}

/**
 * Normalised bend magnitude across the bezel, shared by every surface.
 *
 * This is the complement of the bevel height rather than its derivative. The
 * squircle's slope is unbounded at the outer edge, so normalising by it puts
 * the entire bend in the outermost pixel ring — the map came out as 128 ± 2
 * over 98% of the bezel, which refracts nothing. `1 - h` keeps the peak at the
 * rim (where glass bends light hardest) and lets it decay smoothly all the way
 * to the flat center, which is what the eye reads as a thick piece of glass.
 */
const MAGNITUDES: number[] = (() => {
  const raw: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    raw.push(1 - bezelHeight((i + 0.5) / SAMPLES));
  }
  const peak = Math.max(...raw) || 1;
  return raw.map((value) => value / peak);
})();

function magnitudeAt(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return MAGNITUDES[Math.min(SAMPLES - 1, Math.floor(t * SAMPLES))];
}

/** Signed distance to a rounded rectangle: negative inside, positive outside. */
function roundedRectDistance(px: number, py: number, w: number, h: number, r: number): number {
  const dx = Math.abs(px - w / 2) - (w / 2 - r);
  const dy = Math.abs(py - h / 2) - (h / 2 - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Paints the displacement field for one surface shape and returns a data URL. */
function buildDisplacementMap(
  width: number,
  height: number,
  radius: number,
  bezel: number
): string | null {
  const scale = Math.min(1, MAP_MAX_SIDE / Math.max(width, height));
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(w, h);
  const data = image.data;
  const bezelPx = Math.max(2, bezel * scale);
  const r = Math.max(0, Math.min(radius * scale, Math.min(w, h) / 2));
  const eps = 0.75;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const distance = -roundedRectDistance(cx, cy, w, h, r);

      if (distance >= bezelPx) {
        // Flat center: light passes straight through, no bend.
        data[i] = NEUTRAL;
        data[i + 1] = NEUTRAL;
        data[i + 2] = NEUTRAL;
        data[i + 3] = 255;
        continue;
      }

      // Inward normal: the SDF gradient points outward, so negate it. A convex
      // bevel pulls the backdrop inwards instead of letting it spill outside.
      const gx =
        roundedRectDistance(cx + eps, cy, w, h, r) - roundedRectDistance(cx - eps, cy, w, h, r);
      const gy =
        roundedRectDistance(cx, cy + eps, w, h, r) - roundedRectDistance(cx, cy - eps, w, h, r);
      const length = Math.hypot(gx, gy) || 1;
      const nx = -gx / length;
      const ny = -gy / length;

      // 0 at the outer edge, 1 where the bezel meets the flat center.
      const magnitude = magnitudeAt(distance / bezelPx);
      data[i] = clamp255(NEUTRAL + nx * magnitude * (NEUTRAL - 1));
      data[i + 1] = clamp255(NEUTRAL + ny * magnitude * (NEUTRAL - 1));
      data[i + 2] = NEUTRAL;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function svgElement(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function createLensFilter(spec: Required<LensSpec>): string | null {
  const host = document.getElementById(HOST_ID);
  if (!host) return null;
  const map = buildDisplacementMap(spec.width, spec.height, spec.radius, spec.bezel);
  if (!map) return null;

  const id = `lg-lens-${++serial}`;
  const filter = svgElement('filter', {
    id,
    x: '0',
    y: '0',
    width: '100%',
    height: '100%',
    // sRGB keeps the 128 neutral value linear; the default linearRGB would
    // shift every channel and bake a constant skew into the refraction.
    'color-interpolation-filters': 'sRGB',
  });
  filter.appendChild(
    svgElement('feImage', {
      href: map,
      x: '0',
      y: '0',
      width: '100%',
      height: '100%',
      preserveAspectRatio: 'none',
      result: 'displacement_map',
    })
  );
  filter.appendChild(
    svgElement('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'displacement_map',
      scale: String(spec.displacement),
      xChannelSelector: 'R',
      yChannelSelector: 'G',
    })
  );
  host.appendChild(filter);
  return id;
}

/** Id of the hidden `<svg>` that hosts every generated filter. */
export const HOST_ID = 'lg-filter-host';

/**
 * Returns a ready-to-use filter id for the given shape, generating and caching
 * it on first use. Callers must release it with `releaseLens`.
 */
export function acquireLens(spec: LensSpec): string | null {
  if (typeof document === 'undefined') return null;
  const shortest = Math.min(spec.width, spec.height);
  const bezel = spec.bezel ?? Math.round(Math.min(36, Math.max(8, shortest * 0.22)));
  // Tied to the bezel, not to the element size: a shift wider than the bezel
  // samples past the flat center and smears the backdrop instead of bending
  // it. Chrome bars are short, so 0.35 of the bezel keeps the bend readable
  // without turning the masthead behind a reader toolbar into a blur.
  const displacement = spec.displacement ?? Math.round(Math.min(10, Math.max(2, bezel * 0.35)));
  const full: Required<LensSpec> = {
    width: Math.round(spec.width),
    height: Math.round(spec.height),
    radius: Math.round(spec.radius),
    bezel,
    displacement,
  };
  if (full.width < 4 || full.height < 4) return null;

  const key = `${full.width}x${full.height}r${full.radius}b${full.bezel}d${full.displacement}`;
  const cached = lenses.get(key);
  if (cached) {
    cached.refs += 1;
    return cached.id;
  }
  const id = createLensFilter(full);
  if (!id) return null;
  lenses.set(key, { id, refs: 1 });
  keyByLensId.set(id, key);
  return id;
}

/** Drops a reference and removes the filter once nobody uses it. */
export function releaseLens(id: string): void {
  const key = keyByLensId.get(id);
  if (!key) return;
  const record = lenses.get(key);
  if (!record) return;
  record.refs -= 1;
  if (record.refs > 0) return;
  document.getElementById(HOST_ID)?.querySelector(`#${id}`)?.remove();
  lenses.delete(key);
  keyByLensId.delete(id);
}
