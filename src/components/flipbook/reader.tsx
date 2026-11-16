'use client';
import dynamic from 'next/dynamic';

// The rest of the site can hydrate and respond before the PDF reader bundle loads.
export const Flipbook = dynamic(() => import('./flipbook').then(module => module.Flipbook), {
  ssr: false,
  loading: () => <div role="status" className="flex min-h-[440px] items-center justify-center rounded-2xl border border-ink/15 bg-white">Preparing the reader…</div>,
});
