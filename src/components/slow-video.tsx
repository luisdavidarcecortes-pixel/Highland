'use client';

import { useEffect, useRef } from 'react';

export function SlowVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const setRate = () => { v.playbackRate = 0.5; };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (reduced.matches || document.hidden) v.pause();
      else void v.play().catch(() => {});
    };
    v.addEventListener('loadedmetadata', setRate);
    setRate();
    sync();
    reduced.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { v.removeEventListener('loadedmetadata', setRate); reduced.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return (
    <video
      ref={ref}
      className="absolute inset-0 z-0 h-full w-full object-cover"
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
    />
  );
}
