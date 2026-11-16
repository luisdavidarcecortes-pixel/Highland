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
    let id: number | undefined;
    const update = () => {
      window.clearInterval(id);
      // Restart the reading interval after returning to the tab; never turn
      // pages in the background or immediately upon becoming visible.
      if (!document.hidden) id = window.setInterval(() => tickRef.current(), intervalMs);
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', update); };
  }, [playing, intervalMs]);
}
