import type { Metadata } from 'next';
import { getPublishedEditions } from '@/lib/data-editions';
import { EditionCard } from '@/components/cards';
import { BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Archive',
  description: 'Every published issue of the school newspaper.',
  alternates: { canonical: '/archive' },
  openGraph: { url: '/archive' },
};

export default async function ArchivePage() {
  const editions = await getPublishedEditions();

  const byYear = new Map<string, typeof editions>();
  for (const e of editions) {
    const list = byYear.get(e.school_year) ?? [];
    list.push(e);
    byYear.set(e.school_year, list);
  }
  const years = Array.from(byYear.keys()).sort().reverse();

  return (
    <div className="public-page mx-auto max-w-6xl px-4 py-10 md:py-14">
      <header className="editorial-rule mb-9 border-b pb-5 md:mb-12">
        <p className="editorial-kicker mb-2">The Highlander collection</p>
        <h1 className="masthead text-4xl font-bold md:text-5xl">Archive</h1>
      </header>
      <p className="mb-8 -mt-5 max-w-2xl text-ink/60">
        Every issue of the newspaper, ready to flip through.
      </p>

      {editions.length === 0 && (
        <div className="public-card rounded-2xl border border-ink/10 p-10 text-center md:p-16"><BookOpen size={36} strokeWidth={1.3} className="mx-auto text-brand" aria-hidden /><h2 className="masthead mt-5 text-2xl font-bold">A collection in the making</h2><p className="mx-auto mt-3 max-w-md text-sm text-ink/60">Every published issue will find a home here. The newspaper team is preparing the first edition.</p></div>
      )}

      {years.map((year) => (
        <section key={year} className="mb-10">
          <h2 className="masthead editorial-rule mb-5 border-b pb-2 text-2xl font-bold">
            School year {year}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {(byYear.get(year) ?? []).map((e) => (
              <EditionCard key={e.id} edition={e} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
