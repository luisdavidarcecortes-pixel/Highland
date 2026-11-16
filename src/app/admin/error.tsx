'use client';
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return <div className="public-page panel mx-auto my-10 max-w-xl rounded-2xl p-8"><h2 className="text-xl font-bold">This part of the workspace is unavailable</h2><p className="mt-3 text-sm text-ink/60">We could not load the account or editorial data. Please retry. If this continues, check the connection and database setup.</p><button onClick={reset} className="admin-primary mt-5">Try again</button></div>;
}
