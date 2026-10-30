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
    <div className="admin-shell public-page mx-auto max-w-6xl px-4 py-10 md:py-14">
      <header className="editorial-rule mb-9 border-b pb-5 md:mb-12">
        <p className="editorial-kicker mb-2">Highland Academy · Administration</p>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="masthead text-4xl font-bold md:text-5xl">Editors' panel</h1>
            {demo ? (
              <p className="mt-2 text-sm text-ink/60">Demo mode: changes are not saved.</p>
            ) : (
              user && (
                <p className="mt-2 text-sm text-ink/60">
                  Signed in as <strong className="text-ink">{user.fullName ?? user.email}</strong> ·{' '}
                  <span className="editorial-kicker text-xs font-bold text-brand">{user.role}</span>
                </p>
              )
            )}
          </div>
          <nav className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-full border border-ink/20 bg-white px-5 py-2 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-brand hover:text-paper"
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
