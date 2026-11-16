'use client';

import Atropos from 'atropos/react';
import { useEffect, useState, type ReactNode } from 'react';

type TiltProps = {
  children: ReactNode;
  className?: string;
  /** Maximum rotation in degrees around each axis. */
  max?: number;
};

/**
 * A small, touch-friendly 3D tilt for covers and cards.
 *
 * Atropos rotates its inner wrapper with transforms, so it never fights the
 * hover styles already declared on `.public-card` or `.feature-cover`.
 * `rotateTouch="scroll-y"` keeps vertical scrolling usable on phones.
 * Readers who ask for reduced motion get the plain, flat card.
 */
export function Tilt({ children, className = '', max = 8 }: TiltProps) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (reduced) return <>{children}</>;

  return (
    <Atropos
      className={`tilt-surface ${className}`}
      rotateXMax={max}
      rotateYMax={max}
      rotateTouch="scroll-y"
      duration={450}
      shadow={false}
      highlight={false}
    >
      {children}
    </Atropos>
  );
}
