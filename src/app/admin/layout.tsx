import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/demo';

const TABS = [
  { href: '/admin/editions', label: 'Issues' },
  { href: '/admin/news', label: 'News' },
  { href: '/admin/team', label: 'Team' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  const user = demo ? null : await getSessionUser();

  // NOTE: auth is enforced by src/middleware.ts (redirects unauthenticated
  // visitors to /admin/login). No redirect here: /admin/login renders inside
  // this layout, and redirecting from here would loop onto itself.

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="masthead text-2xl font-bold">Editors' panel</h1>
          {demo ? (
            <p className="text-sm text-ink/60">Demo mode: changes are not saved.</p>
          ) : (
            user && (
              <p className="text-sm text-ink/60">
                {user.fullName ?? user.email} ·{' '}
                <span className="uppercase text-xs font-bold text-accent">{user.role}</span>
              </p>
            )
          )}
        </div>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              data-lg-static
              className="lg-glass px-4 py-2 rounded-full text-sm font-semibold border border-ink/15 hover:bg-ink/5"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
