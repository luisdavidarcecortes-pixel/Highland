import type { MetadataRoute } from 'next';
import { getPublishedEditions } from '@/lib/data-editions';
import { getPublishedArticles } from '@/lib/data-articles';
import { absoluteUrl } from '@/lib/site';

// Published content changes after the build, so the sitemap is generated per
// request instead of being frozen with whatever the database held at build time.
export const dynamic = 'force-dynamic';

function validDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [editions, articles] = await Promise.all([
    getPublishedEditions(),
    getPublishedArticles(),
  ]);

  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/read'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/archive'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/news'), changeFrequency: 'daily', priority: 0.8 },
  ];

  for (const edition of editions) {
    pages.push({
      url: absoluteUrl(`/read/${edition.id}`),
      lastModified: validDate(edition.edition_date),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  for (const article of articles) {
    pages.push({
      url: absoluteUrl(`/news/${article.slug}`),
      lastModified: validDate(article.created_at),
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  return pages;
}
