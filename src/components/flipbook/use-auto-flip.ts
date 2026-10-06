'use client';

import { useEffect, useRef } from 'react';

/**
 * Auto-play mode for lobby screens: flips one page forward every
 * `intervalMs` while `playing` is true. `onTick` is read through a ref so
 * changing callbacks don't restart the timer.
 */
export function useAutoFlip(playing: boolean, intervalMs: number, onTick: () => void) {
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => tickRef.current(), intervalMs);
    return () => window.clearInterval(id);
  }, [playing, intervalMs]);
}
