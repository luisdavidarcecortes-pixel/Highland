'use client';

import { useEffect, useRef } from 'react';

/** Seconds of fade-out at the loop's end and fade-in after it restarts. */
const LOOP_FADE_S = 1.2;

/**
 * Cinematic Milky Way loop behind the reader page.
 * - Fixed, full viewport, behind all content (-z-10), never interactive.
 * - Darkened with a veil so the book and text stay readable, plus a soft
 *   shield behind the site header so the menu always keeps contrast.
 * - Fades out during the last moments of the loop and fades back in when it
 *   restarts, so the seam between loops is a gentle breath, not a hard cut.
 * - Pauses when the tab is hidden and for prefers-reduced-motion users
 *   (the poster frame stays as a still image in that case).
 */
export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const fade = fadeRef.current;
    if (!video) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateFade = () => {
      if (!fade) return;
      if (video.paused || !Number.isFinite(video.duration) || video.duration <= 0) {
        fade.style.opacity = '0';
        return;
      }

      const remaining = video.duration - video.currentTime;
      const visibility = Math.min(1, remaining / LOOP_FADE_S, video.currentTime / LOOP_FADE_S);
      fade.style.opacity = (1 - visibility).toFixed(2);
    };

    const sync = () => {
      if (reduced.matches || document.hidden) {
        video.pause();
        if (fade) fade.style.opacity = '0';
      } else {
        video.play().catch(() => {
          /* autoplay blocked: the poster frame remains */
        });
      }
    };

    const fadeEvents = ['timeupdate', 'durationchange', 'playing', 'seeked'];
    fadeEvents.forEach((event) => video.addEventListener(event, updateFade));
    sync();
    reduced.addEventListener?.('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      fadeEvents.forEach((event) => video.removeEventListener(event, updateFade));
      reduced.removeEventListener?.('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#07130f]"
    >
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          className="h-full w-full object-cover brightness-125"
          src="/bg/milky-way.mp4"
          poster="/bg/milky-way.jpg"
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          disablePictureInPicture
          tabIndex={-1}
        />
        {/* Ink veil: a little darkened, slightly stronger top/bottom for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#07130f]/45 via-[#07130f]/25 to-[#07130f]/60" />
        {/* Loop-fade layer: dips to black for a soft seam at each loop restart */}
        <div
          ref={fadeRef}
          className="absolute inset-0 bg-[#07130f]"
          style={{ opacity: 0, transition: 'opacity 300ms linear' }}
        />
      </div>
      {/* Contrast shield behind the site header (~first 210px): guarantees the
          masthead and menu stay readable over the brightest part of the sky. */}
      <div className="absolute inset-x-0 top-0 h-[180px] bg-gradient-to-b from-[#090d1a]/65 via-[#171e55]/30 to-transparent" />
    </div>
  );
}
