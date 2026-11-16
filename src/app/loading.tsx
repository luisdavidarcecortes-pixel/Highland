export default function LoadingPage() {
  return (
    <div className="public-page mx-auto w-full max-w-6xl px-4 py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading the page…</span>
      <div className="space-y-4" aria-hidden="true">
        <div className="h-3 w-40 rounded-full bg-ink/10" />
        <div className="h-10 w-3/4 rounded-lg bg-ink/10" />
        <div className="h-10 w-1/2 rounded-lg bg-ink/10" />
        <div className="h-40 w-full rounded-2xl bg-ink/5" />
      </div>
    </div>
  );
}
