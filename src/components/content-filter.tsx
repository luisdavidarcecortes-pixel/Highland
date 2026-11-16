'use client';
import { Search } from 'lucide-react';

export function ContentFilter({ query, setQuery, status, setStatus }: { query: string; setQuery: (value: string) => void; status: string; setStatus: (value: string) => void }) {
  return <div className="mb-4 flex flex-wrap gap-3"><label className="relative min-w-0 flex-1"><Search size={17} className="absolute left-3 top-3 text-brand" aria-hidden /><span className="sr-only">Search content</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by title" className="w-full rounded-xl border border-ink/15 py-2.5 pl-10 pr-3 text-sm" /></label><select aria-label="Publication status" value={status} onChange={event => setStatus(event.target.value)} className="rounded-xl border border-ink/15 px-3 py-2 text-sm"><option value="all">All content</option><option value="published">Published</option><option value="draft">Drafts</option></select></div>;
}
