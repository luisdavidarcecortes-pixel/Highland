import type { Metadata } from 'next';
import { getPublishedEditions } from '@/lib/data-editions';
import { EditionCard } from '@/components/cards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Archive',
  description: 'Every published issue of the school newspaper.',
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
    <div className="public-page mx-auto max-w-6xl px-4 py-10">
      <h1 className="masthead text-3xl font-bold">Archive</h1>
      <p className="text-ink/60 mt-1 mb-8">
        Every issue of the newspaper, ready to flip through.
      </p>

      {editions.length === 0 && (
        <p className="text-ink/60">No issues published yet.</p>
      )}

      {years.map((year) => (
        <section key={year} className="mb-10">
          <h2 className="masthead text-xl font-bold border-b-2 border-ink pb-1 mb-5">
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
