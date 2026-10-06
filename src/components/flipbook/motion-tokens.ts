'use client';

/**
 * Shared motion language for the reader.
 * One place to tune durations/curves so every animated surface feels like
 * the same product. Imported by toolbar.tsx and flipbook.tsx.
 */
import type { Transition, Variants } from 'motion/react';

/** Quick, slightly crisp — small elements (odometer digits, chips). */
export const springFast: Transition = { type: 'spring', stiffness: 420, damping: 34 };

/** The house spring — panels, book entrance, progress bar. */
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 30 };

/** Smooth deceleration for one-off entrances. */
export const easeOutQuint: Transition = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

/** Toolbar: staggered drop-in of the control clusters. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
};

export const itemFromTop: Variants = {
  hidden: { opacity: 0, y: -10 },
  show: { opacity: 1, y: 0, transition: springSoft },
};

/** Floating panels (search): drop in from under the toolbar. */
export const panelIn: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } },
};

/** Left-anchored panels (contents drawer). */
export const panelInLeft: Variants = {
  hidden: { opacity: 0, x: -14, scale: 0.98 },
  show: { opacity: 1, x: 0, scale: 1, transition: springSoft },
  exit: { opacity: 0, x: -10, scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } },
};
