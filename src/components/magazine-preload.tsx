'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { preloadMagazine } from '@/lib/reader-preload';

export function MagazinePreload() {
  const pathname = usePathname();
  useEffect(() => {
    // Only the reader needs the rendered pages. Warming the magazine on every
    // public route downloaded the whole issue (and made the server render the
    // PDF) for visitors who never open it.
    if (!pathname.startsWith('/read')) return;
    const edition = /^\/read\/([^/]+)$/.exec(pathname)?.[1];
    // A short delay keeps the preparation off the critical path of the page.
    const timer = window.setTimeout(() => {
      void preloadMagazine(edition ?? 'latest');
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}
