import { pageSession } from '@/lib/page-session';
import { isDemoMode } from '@/lib/demo';
import { AccountManager } from './account-manager';

export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const demo = isDemoMode();
  const user = demo ? { id: 'demo', email: 'luisa@school.edu', fullName: 'Ms. Luisa Martin', role: 'admin' as const, aal: 'aal1' as const } : await pageSession();
  return <AccountManager user={user} demo={demo} />;
}
