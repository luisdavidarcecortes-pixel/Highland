import { redirect } from 'next/navigation';
import { getAllArticles } from '@/lib/data-articles';
import { pageSession } from '@/lib/page-session';
import { isDemoMode } from '@/lib/demo';
import { ArticlesManager } from './articles-manager';

export const dynamic = 'force-dynamic';

export default async function AdminArticlesPage() {
  const demo = isDemoMode();
  const user = demo ? null : await pageSession();
  if (!demo && !user) redirect('/admin/login');

  const articles = await getAllArticles();
  return <ArticlesManager initialArticles={articles} demo={demo} currentUserId={user?.id ?? null} admin={user?.role === 'admin'} />;
}
