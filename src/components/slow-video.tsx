'use client';

import { useEffect, useRef } from 'react';

export function SlowVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const setRate = () => { v.playbackRate = 0.5; };
    v.addEventListener('loadedmetadata', setRate);
    setRate();
    return () => v.removeEventListener('loadedmetadata', setRate);
  }, []);
  return (
    <video
      ref={ref}
      className="absolute inset-0 z-0 h-full w-full object-cover"
      src={src}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
    />
  );
}
