import { redirect } from 'next/navigation';
import { getAllEditions } from '@/lib/data-editions';
import { pageSession } from '@/lib/page-session';
import { isDemoMode } from '@/lib/demo';
import { EditionsManager } from './editions-manager';

export const dynamic = 'force-dynamic';

export default async function AdminEditionsPage() {
  const demo = isDemoMode();
  // Defense in depth: the middleware already redirects, but a misconfigured
  // matcher must never render the panel for an anonymous visitor.
  const user = demo ? null : await pageSession();
  if (!demo && !user) redirect('/admin/login');

  const editions = await getAllEditions();
  return <EditionsManager initialEditions={editions} demo={demo} admin={user?.role === 'admin'} currentUserId={user?.id ?? null} />;
}
