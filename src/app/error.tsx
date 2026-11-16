'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the digest in the browser console: it is what links a report to the
    // server log entry without exposing internals to the visitor.
    console.error('Page failed to render', error.digest ?? error.message);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="public-page mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center"
    >
      <p className="editorial-kicker">Something went wrong</p>
      <h1 className="masthead mt-3 text-4xl font-bold md:text-5xl">This page could not be loaded.</h1>
      <p className="mt-4 max-w-md text-ink/70">
        A temporary problem stopped the page from rendering. Try again; if it keeps happening, come
        back in a few minutes.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-full bg-brand px-6 py-3 font-semibold text-paper transition-colors hover:bg-brand-dark"
      >
        Try again
      </button>
    </div>
  );
}
