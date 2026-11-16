import { getSessionState } from '@/lib/auth';
import { isDemoMode } from '@/lib/demo';
import { AdminNavigation } from '@/components/admin-navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  const session = demo ? null : await getSessionState();
  const user = session?.user ?? null;

  // NOTE: auth is enforced by src/middleware.ts (redirects unauthenticated
  // visitors to /admin/login). No redirect here: /admin/login renders inside
  // this layout, and redirecting from here would loop onto itself.
  // Every admin page also re-checks the session server-side.

  return <AdminNavigation demo={demo} user={user}>{children}</AdminNavigation>;
}
