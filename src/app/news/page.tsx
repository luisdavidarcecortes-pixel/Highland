import type { Metadata } from 'next';
import { getPublishedArticles } from '@/lib/data-articles';
import { ArticleCard } from '@/components/cards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'News',
  description: 'School news between issues.',
  alternates: { canonical: '/news' },
};

export default async function NewsPage() {
  const articles = await getPublishedArticles();

  return (
    <div className="public-page mx-auto max-w-6xl px-4 py-10 md:py-14">
      <header className="editorial-rule mb-9 border-b pb-5 md:mb-12">
        <p className="editorial-kicker mb-2">Around campus</p>
        <h1 className="masthead text-4xl font-bold md:text-5xl">News</h1>
      </header>
      <p className="mb-8 -mt-5 max-w-2xl text-ink/60">
        What is happening at school, up to date.
      </p>

      {articles.length === 0 ? (
        <p className="text-ink/60">No news published yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
