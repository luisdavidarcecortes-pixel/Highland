'use client';

import { useEffect, useState } from 'react';

/** Measures an element by id and returns its current size. */
export function useElementSize(id: string) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id]);

  return size;
}
