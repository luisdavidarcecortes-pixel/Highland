import Link from 'next/link';
import { ArrowRight, BookOpen, Newspaper, FileClock, ShieldCheck } from 'lucide-react';
import { pageSession } from '@/lib/page-session';
import { isDemoMode } from '@/lib/demo';
import { getAllEditions } from '@/lib/data-editions';
import { getAllArticles } from '@/lib/data-articles';

export const dynamic = 'force-dynamic';
export default async function AdminIndexPage() {
  const demo = isDemoMode();
  const user = demo ? null : await pageSession();
  const [editions, articles] = await Promise.all([getAllEditions(), getAllArticles()]);
  const drafts = editions.filter(issue => !issue.published).length + articles.filter(article => !article.published).length;
  return <div className="space-y-7">
    <section className="admin-welcome"><div><p className="text-xs font-bold uppercase tracking-[.18em] opacity-70">A new story starts here</p><h2>Welcome back{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}.</h2><p>Make room for the stories that matter to your campus.</p><Link href="/admin/editions">Prepare an issue <ArrowRight size={17} /></Link></div><span className="admin-welcome-letter" aria-hidden>H.</span></section>
    <div className="grid gap-4 sm:grid-cols-3">{[{ label: 'Published issues', value: editions.filter(issue => issue.published).length, icon: BookOpen }, { label: 'Published stories', value: articles.filter(article => article.published).length, icon: Newspaper }, { label: 'Drafts to review', value: drafts, icon: FileClock }].map(stat => <section className="panel admin-stat" key={stat.label}><stat.icon size={20} className="text-brand" aria-hidden /><strong>{stat.value}</strong><p>{stat.label}</p></section>)}</div>
    <div className="grid gap-5 md:grid-cols-2">{[{ href: '/admin/news', label: 'Tell the next story', text: 'Write a campus update, add a photo and share it with the community.' }, { href: '/admin/account', label: 'Keep your account secure', text: 'Review your profile and set up your authenticator before managing team access.' }].map(item => <Link key={item.href} href={item.href} className="panel admin-shortcut"><ShieldCheck size={21} className="text-brand" /><h3>{item.label}</h3><p>{item.text}</p><span>Open workspace <ArrowRight size={16} /></span></Link>)}</div>
  </div>;
}
