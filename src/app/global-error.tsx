'use client';

/**
 * Last resort UI: the root layout itself failed, so there is no header, no
 * footer and no error boundary around it. Next renders this document instead
 * of a blank page.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          color: '#20372e',
          background: '#f6f3eb',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', margin: 0 }}>This page could not be loaded.</h1>
        <p style={{ maxWidth: '32rem', lineHeight: 1.7 }}>
          A temporary problem stopped the site from rendering. Try again; if it keeps happening,
          come back in a few minutes.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '1.5rem',
            background: '#166344',
            color: '#fffefa',
            border: 0,
            borderRadius: '9999px',
            padding: '0.75rem 1.5rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ marginTop: '2rem', fontSize: '0.75rem', opacity: 0.6 }}>Reference: {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
