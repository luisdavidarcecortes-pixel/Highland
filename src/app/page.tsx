import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, Newspaper } from 'lucide-react';
import { getPublishedEditions } from '@/lib/data-editions';
import { getPublishedArticles } from '@/lib/data-articles';
import { EditionCard, ArticleCard } from '@/components/cards';
import { EditionCover } from '@/components/edition-cover';
import { Reveal } from '@/components/reveal';
import { formatMonthEs, issueLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const editions = await getPublishedEditions();
  const articles = (await getPublishedArticles()).slice(0, 3);
  const latest = editions[0];

  return (
    <div className="public-page mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-12">
      <Reveal as="section" className="mb-8 md:mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="h-px w-8 bg-brand" />
          <p className="text-xs uppercase tracking-[0.22em] text-accent font-semibold">
            The Highlander · Student newspaper
          </p>
        </div>
        <h1 className="masthead max-w-3xl text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
          Stories from the heart of campus.
        </h1>
        <p className="mt-3 max-w-2xl text-ink/70 leading-relaxed">
          Student voices, school news, and every new issue of The Highlander.
        </p>
      </Reveal>

      {latest && (
        <Reveal as="div" delay={0}>
          <section
            data-lg-surface
            className="lg-glass relative isolate grid md:grid-cols-[minmax(240px,0.8fr)_1.2fr] gap-8 lg:gap-14 items-center overflow-hidden rounded-3xl border border-ink/10 p-5 sm:p-7 md:p-9 lg:p-12"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand/10 via-transparent to-accent/5" />
            <Link
              href={`/read/${latest.id}`}
              className="group mx-auto block w-full max-w-[340px] rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              <EditionCover
                coverUrl={latest.cover_url}
                pdfUrl={latest.pdf_url}
                alt={`${issueLabel(latest.number) ?? 'Issue'} cover`}
                className="relative aspect-[3/4] overflow-hidden rounded-xl shadow-page transition-transform duration-500 group-hover:scale-[1.02]"
                sizes="(max-width: 768px) 80vw, 340px"
              />
            </Link>
            <div className="py-2 md:py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-accent font-bold">
                Latest issue
              </p>
              <h2 className="masthead text-3xl sm:text-4xl lg:text-5xl font-bold mt-3 leading-tight">
                {latest.title}
              </h2>
              {latest.description && (
                <p className="text-ink/70 mt-4 text-base md:text-lg leading-relaxed">
                  {latest.description}
                </p>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 text-sm text-ink/60">
                {issueLabel(latest.number) && (
                  <span className="font-semibold text-paper">{issueLabel(latest.number)}</span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={15} aria-hidden />
                  {formatMonthEs(latest.edition_date)}
                </span>
                <span>School year {latest.school_year}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-7">
                <Link
                  href={`/read/${latest.id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-brand text-paper px-6 py-3 font-semibold hover:bg-brand-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <BookOpen size={18} /> Read now
                </Link>
                <Link
                  href="/archive"
                  className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-6 py-3 font-semibold hover:bg-ink/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Explore archive <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>
        </Reveal>
      )}

      <Reveal as="section" delay={100} className="mt-14 md:mt-20">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold mb-2">
              Around campus
            </p>
            <div className="flex items-center gap-2">
              <Newspaper size={20} className="text-brand" aria-hidden />
              <h2 className="masthead text-2xl md:text-3xl font-bold">Latest news</h2>
            </div>
          </div>
          <Link
            href="/news"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            All news <ArrowRight size={16} />
          </Link>
        </div>
        {articles.length === 0 ? (
          <p className="rounded-2xl border border-ink/10 bg-white/5 px-5 py-6 text-ink/60">
            No news published yet.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {articles.map((a, index) => (
              <div key={a.id} style={{ transitionDelay: `${140 + index * 80}ms` }}>
                <ArticleCard article={a} />
              </div>
            ))}
          </div>
        )}
      </Reveal>

      {editions.length > 1 && (
        <Reveal as="section" delay={120} className="mt-14 md:mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold mb-2">
                From the archives
              </p>
              <h2 className="masthead text-2xl md:text-3xl font-bold">More issues</h2>
            </div>
            <Link
              href="/archive"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Browse all issues <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 lg:gap-6">
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
