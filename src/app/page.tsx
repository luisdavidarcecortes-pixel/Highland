import type { Metadata } from 'next';
import { ArrowRight, BookOpen, CalendarDays, Newspaper } from 'lucide-react';
import { getPublishedEditions } from '@/lib/data-editions';
import { getPublishedArticles } from '@/lib/data-articles';
import { EditionCard, ArticleCard } from '@/components/cards';
import { EditionCover } from '@/components/edition-cover';
import { Reveal } from '@/components/reveal';
import { Link } from '@/components/page-transitions';
import { TextReveal } from '@/components/text-reveal';
import { Tilt } from '@/components/tilt';
import { formatMonthEs, issueLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const [editions, allArticles] = await Promise.all([getPublishedEditions(), getPublishedArticles()]);
  const articles = allArticles.slice(0, 3);
  const latest = editions[0];

  return (
    <div className="public-page home-page mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
      <Reveal as="section" className="mb-8 md:mb-12">
        <div className="editorial-rule mb-5 flex items-center gap-3 pb-3">
          <span className="h-px w-8 bg-brand" />
          <p className="editorial-kicker">
            The Highlander · Student newspaper
          </p>
        </div>
        <div className="home-intro"><TextReveal
          className="masthead max-w-4xl text-4xl font-bold leading-[1.04] sm:text-5xl md:text-6xl"
          lines={['Our campus.', 'Our stories.']}
        />
        <p className="max-w-md text-sm leading-relaxed text-ink/70 md:pb-1 md:pl-10 md:text-base">
          Student voices, school news, and every new issue of The Highlander.
          <span className="mt-3 block text-xs font-semibold uppercase tracking-widest text-brand">Written by students. Shared with everyone.</span>
        </p></div>
      </Reveal>

      {latest && (
        <Reveal as="div" delay={0}>
          <section
            className="public-feature relative isolate grid items-center gap-8 overflow-hidden rounded-2xl border p-6 sm:p-8 md:grid-cols-[1.2fr_minmax(240px,0.8fr)] md:p-10 lg:gap-14 lg:p-12"
          >
            <Tilt className="order-2 mx-auto w-full max-w-[300px]" max={6}>
              <Link
                href={`/read/${latest.id}`}
                className="feature-cover group block rounded-sm transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                <EditionCover
                  coverUrl={latest.cover_url}
                  pdfUrl={latest.pdf_url}
                  alt={`${issueLabel(latest.number) ?? 'Issue'} cover`}
                  className="relative aspect-[3/4] overflow-hidden"
                  sizes="(max-width: 768px) 80vw, 340px"
                />
              </Link>
            </Tilt>
            <div className="order-1 py-2 md:py-4">
              <p className="editorial-kicker">Latest issue</p>
              <TextReveal
                as="h2"
                className="masthead mt-3 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl"
                lines={[latest.title]}
              />
              {latest.description && (
                <p className="text-ink/70 mt-4 text-base md:text-lg leading-relaxed">
                  {latest.description}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/60">
                {issueLabel(latest.number) && (
                  <span className="font-semibold text-ink">{issueLabel(latest.number)}</span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={15} aria-hidden />
                  {formatMonthEs(latest.edition_date)}
                </span>
                <span>School year {latest.school_year}</span>
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
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

      {!latest && <section className="public-feature grid items-center gap-8 rounded-2xl p-7 md:grid-cols-[1fr_auto] md:p-12"><div><p className="editorial-kicker">Coming soon</p><h2 className="masthead mt-5 max-w-xl text-3xl font-bold leading-tight md:text-5xl">The next story is being written.</h2><p className="mt-5 max-w-xl text-sm leading-relaxed text-paper/80 md:text-base">Our editorial team is preparing the first digital issue. Come back soon for student voices, campus stories and a fresh perspective.</p><Link href="/news" className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold">Explore campus news <ArrowRight size={17} /></Link></div><BookOpen size={120} strokeWidth={.8} className="hidden text-paper/30 md:block" aria-hidden /></section>}

      <Reveal as="section" delay={100} className="mt-16 border-t border-ink/15 pt-8 md:mt-20 md:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="editorial-kicker mb-2">
              Around campus
            </p>
            <div className="flex items-center gap-2">
              <Newspaper size={20} className="text-brand" aria-hidden />
              <TextReveal as="h2" className="masthead text-2xl md:text-3xl font-bold" lines={['Latest news']} />
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
        <Reveal as="section" delay={120} className="mt-16 border-t border-ink/15 pt-8 md:mt-20 md:pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <p className="editorial-kicker mb-2">
                From the archives
              </p>
              <TextReveal as="h2" className="masthead text-2xl md:text-3xl font-bold" lines={['More issues']} />
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
