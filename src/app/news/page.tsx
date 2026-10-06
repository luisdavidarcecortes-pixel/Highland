import type { Metadata } from 'next';
import { getPublishedArticles } from '@/lib/data-articles';
import { ArticleCard } from '@/components/cards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'News',
  description: 'School news between issues.',
};

export default async function NewsPage() {
  const articles = await getPublishedArticles();

  return (
    <div className="public-page mx-auto max-w-6xl px-4 py-10">
      <h1 className="masthead text-3xl font-bold">News</h1>
      <p className="text-ink/60 mt-1 mb-8">What is happening at school, up to date.</p>

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
