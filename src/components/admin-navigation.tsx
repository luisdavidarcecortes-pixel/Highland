'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, Newspaper, UsersRound, History, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { AdminSignOut } from './admin-sign-out';

const sections = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, description: 'Your newsroom at a glance.' },
  { href: '/admin/editions', label: 'Issues', icon: BookOpen, description: 'Prepare, review and publish the next issue.' },
  { href: '/admin/news', label: 'News', icon: Newspaper, description: 'Keep your campus community informed.' },
  { href: '/admin/team', label: 'Editorial team', icon: UsersRound, description: 'Manage invitations, roles and access.', admin: true },
  { href: '/admin/activity', label: 'Activity', icon: History, description: 'Follow the changes made in your newsroom.', admin: true },
  { href: '/admin/account', label: 'Account & security', icon: ShieldCheck, description: 'Manage your profile and protect your account.' },
];
export function AdminNavigation({ children, demo, user }: { children: React.ReactNode; demo: boolean; user: { fullName: string | null; email: string; role: string } | null }) {
  const pathname = usePathname();
  if (pathname === '/admin/login') return <div className="admin-shell public-page admin-login">{children}</div>;
  const current = sections.find(section => section.href === pathname) ?? sections[0];
  return <div className="admin-shell public-page admin-workspace">
    <aside className="admin-sidebar">
      <Link href="/admin" className="admin-wordmark"><span className="admin-mark">H.</span><span>The Highlander<small>EDITORIAL WORKSPACE</small></span></Link>
      <p className="admin-nav-label">Workspace</p>
      <nav aria-label="Editorial workspace" className="admin-nav">{sections.filter(section => !section.admin || demo || user?.role === 'admin').map(section => <Link key={section.href} href={section.href} aria-current={pathname === section.href ? 'page' : undefined}><section.icon size={18} aria-hidden /><span>{section.label}</span></Link>)}</nav>
      <div className="admin-sidebar-bottom"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">View newspaper <ArrowUpRight size={16} /></Link><div className="mt-5 border-t border-ink/10 pt-5"><p className="truncate text-sm font-bold">{demo ? 'Demo workspace' : user?.fullName || user?.email || 'Editorial workspace'}</p><p className="mt-1 text-xs capitalize text-ink/60">{demo ? 'Preview · changes are not saved' : user?.role}</p>{user && <div className="mt-4"><AdminSignOut /></div>}</div></div>
    </aside>
    <div className="admin-content min-w-0"><header className="admin-page-heading"><p className="editorial-kicker">The Highlander / Workspace</p><h1>{current.label}</h1><p>{current.description}</p>{demo && <span className="status-badge status-pending mt-4">Demo preview · changes are not saved</span>}</header>{children}</div>
  </div>;
}
