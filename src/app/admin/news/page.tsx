import { getAllArticles } from '@/lib/data-articles';
import { isDemoMode } from '@/lib/demo';
import { ArticlesManager } from './articles-manager';

export const dynamic = 'force-dynamic';

export default async function AdminArticlesPage() {
  const articles = await getAllArticles();
  return <ArticlesManager initialArticles={articles} demo={isDemoMode()} />;
}
