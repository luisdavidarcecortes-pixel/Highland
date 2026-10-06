import Link from 'next/link';
import { BookOpen, Newspaper } from 'lucide-react';
import { getPublishedEditions } from '@/lib/data-editions';
import { getPublishedArticles } from '@/lib/data-articles';
import { EditionCard, ArticleCard } from '@/components/cards';
import { EditionCover } from '@/components/edition-cover';
import { Reveal } from '@/components/reveal';
import { issueLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const editions = await getPublishedEditions();
  const articles = (await getPublishedArticles()).slice(0, 3);
  const latest = editions[0];

  return (
    <div className="public-page mx-auto max-w-6xl px-4 py-10">
      {latest && (
        <Reveal as="div" delay={0}>
          <section
            data-lg-surface
            className="lg-glass grid md:grid-cols-[280px_1fr] gap-8 items-center rounded-2xl border border-ink/10 p-6 md:p-8"
          >
            <Link href={`/read/${latest.id}`} className="block">
              <EditionCover
                coverUrl={latest.cover_url}
                pdfUrl={latest.pdf_url}
                alt={`${issueLabel(latest.number) ?? 'Issue'} cover`}
                className="relative aspect-[3/4] rounded-lg overflow-hidden shadow-page"
                sizes="280px"
              />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-widest text-accent font-bold">
                {issueLabel(latest.number)
                  ? `Latest issue · ${issueLabel(latest.number)}`
                  : 'Latest issue'}
              </p>
              <h1 className="masthead text-3xl md:text-4xl font-bold mt-2">{latest.title}</h1>
              {latest.description && (
                <p className="text-ink/70 mt-3 leading-relaxed">{latest.description}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-6">
                <Link
                  href={`/read/${latest.id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-brand text-paper px-5 py-2.5 font-semibold hover:bg-brand-dark transition-colors"
                >
                  <BookOpen size={18} /> Read now
                </Link>
                <Link
                  href="/archive"
                  className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 font-semibold hover:bg-ink/5 transition-colors"
                >
                  Browse the archive
                </Link>
              </div>
            </div>
          </section>
        </Reveal>
      )}

      <Reveal as="section" delay={100} className="mt-12">
        <div className="flex items-center gap-2 mb-5">
          <Newspaper size={20} className="text-brand" />
          <h2 className="masthead text-2xl font-bold">Latest news</h2>
        </div>
        {articles.length === 0 ? (
          <p className="text-ink/60">No news published yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map((a, index) => (
              <div key={a.id} style={{ transitionDelay: `${140 + index * 80}ms` }}>
                <ArticleCard article={a} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-6">
          <Link href="/news" className="text-brand font-semibold hover:underline">
            See all news →
          </Link>
        </div>
      </Reveal>

      {editions.length > 1 && (
        <Reveal as="section" delay={120} className="mt-12">
          <h2 className="masthead text-2xl font-bold mb-5">Other issues</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {editions.slice(1, 5).map((e, index) => (
              <div key={e.id} style={{ transitionDelay: `${160 + index * 80}ms` }}>
                <EditionCard edition={e} />
              </div>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}
