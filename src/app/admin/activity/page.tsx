import { pageSession } from '@/lib/page-session';
import { isDemoMode } from '@/lib/demo';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { History } from 'lucide-react';

export const dynamic = 'force-dynamic';
export default async function ActivityPage() {
  const demo = isDemoMode();
  const user = demo ? null : await pageSession();
  if (!demo && user?.role !== 'admin') return <p className="panel rounded-2xl p-6">Only administrators can view activity history.</p>;
  const client = demo ? null : await getSupabaseServerClient();
  const result = client ? await client.from('editorial_audit').select('id, actor_name, entity, action, details, created_at').order('created_at', { ascending: false }).limit(100) : null;
  if (result?.error) throw new Error('Activity history is temporarily unavailable. Check that the database migration has been applied.');
  const events = result?.data ?? [];
  return <section className="panel overflow-hidden rounded-2xl">
    <div className="border-b border-ink/10 p-6"><h2 className="text-xl font-bold">Editorial activity</h2><p className="mt-2 text-sm text-ink/60">The latest 100 changes to content, profiles and team access.</p></div>
    {events.length === 0 ? <div className="p-12 text-center"><History size={32} className="mx-auto text-brand" /><h3 className="mt-4 font-semibold">{demo ? 'Activity preview' : 'No activity recorded yet'}</h3><p className="mx-auto mt-2 max-w-md text-sm text-ink/60">{demo ? 'Connect Supabase to see actual editorial changes here.' : 'Changes made after the migration will appear here automatically.'}</p></div> : <ol className="divide-y divide-black/5">{events.map(event => <li key={event.id} className="flex flex-col justify-between gap-2 px-6 py-5 sm:flex-row">
      <div><p className="text-sm"><strong>{event.actor_name || 'System / invitation'}</strong> · {event.action} · {event.entity}</p><p className="mt-1 text-sm text-ink/60">{event.details.title || event.details.name || 'Team profile'}{event.entity === 'profiles' ? ` · ${event.details.role} · ${event.details.active ? 'active' : 'inactive'}` : ` · ${event.details.published ? 'published' : 'draft'}`}</p></div><time dateTime={event.created_at} className="shrink-0 text-xs text-ink/60">{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(new Date(event.created_at))} CT</time>
    </li>)}</ol>}
  </section>;
}
