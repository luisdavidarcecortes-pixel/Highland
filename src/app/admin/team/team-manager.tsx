'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, ShieldCheck, User, UserRoundMinus, Mail, Search, RotateCcw } from 'lucide-react';
import type { ProfileLite, Role } from '@/lib/types';
import { requestJson } from '@/lib/request-json';

export function TeamManager({
  team,
  currentUserId,
  demo,
  verified,
}: {
  team: ProfileLite[];
  demo: boolean;
  currentUserId: string | null;
  verified: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [invite, setInvite] = useState({ email: '', fullName: '', role: 'editor' as Role });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const locked = !demo && !verified;
  const status = (member: ProfileLite) => member.active === false ? 'Inactive' : member.invited_at && !member.confirmed_at ? 'Invited' : 'Active';
  const visible = team.filter(member => `${member.full_name} ${member.email}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || status(member).toLowerCase() === filter));

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (demo) {
      setMsg('Demo mode: set up Supabase to invite real editors.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
        signal: AbortSignal.timeout(45000),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Invite failed');
      setMsg(`Invitation sent to ${invite.email}.`);
      setInvite({ email: '', fullName: '', role: 'editor' });
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id: string, role: Role) {
    if (demo) { setMsg('Demo preview: changes are not saved.'); return; }
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      await requestJson('/api/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, role }) });
      setMsg('Role updated.'); router.refresh();
    } catch (error) { setMsg(error instanceof Error ? error.message : 'Could not change the role.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (demo) { setMsg('Demo preview: changes are not saved.'); return; }
    if (!confirm('Deactivate this member’s editorial access? Their publications and authorship will be preserved.')) return;
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      await requestJson(`/api/team?id=${id}`, { method: 'DELETE' });
      setMsg('Editorial access deactivated. Publications and authorship were preserved.'); router.refresh();
    } catch (error) { setMsg(error instanceof Error ? error.message : 'Could not remove the member.'); }
    finally { setBusy(false); }
  }

  async function restore(id: string) {
    if (demo) { setMsg('Demo preview: changes are not saved.'); return; }
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await requestJson('/api/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, active: true }) }); setMsg('Editorial access restored.'); router.refresh(); }
    catch (error) { setMsg(error instanceof Error ? error.message : 'Could not restore access.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {locked && <p className="panel-note rounded-xl p-4 text-sm">Verify two-factor authentication before changing team access. <Link href="/admin/account" className="font-bold underline">Open account & security →</Link></p>}
      {msg && <p role="status" aria-live="polite" className="panel-note rounded-xl p-4 text-sm">{msg}</p>}
      <div className="admin-manager-grid grid gap-6">
      <form
        onSubmit={handleInvite}
        className="panel rounded-xl p-5 space-y-3 h-fit"
      >
        <h2 className="masthead text-xl font-bold">Invite an editor</h2>
        <p className="text-sm leading-relaxed text-ink/60">Bring a new voice into the newsroom. They will receive a secure setup link.</p>
        <fieldset disabled={busy || locked} className="space-y-4">
        <div>
          <label htmlFor="team-email" className="block text-xs font-semibold mb-1">Email *</label>
          <input
            id="team-email"
            type="email"
            required
            value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })}
            placeholder="student@school.edu"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="team-name" className="block text-xs font-semibold mb-1">Name</label>
          <input
            id="team-name"
            value={invite.fullName}
            onChange={(e) => setInvite({ ...invite, fullName: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="team-role" className="block text-xs font-semibold mb-1">Role</label>
          <select
            id="team-role"
            value={invite.role}
            onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          >
            <option value="editor">Editor (writes and publishes content)</option>
            <option value="admin">Admin (also manages the team)</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || locked}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50"
        >
          <UserPlus size={16} /> {busy ? 'Sending…' : 'Send invitation'}
        </button>
        </fieldset>
      </form>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">The newsroom</h2><span className="status-badge">{team.filter(member => member.active !== false).length} members with access</span></div>
        <div className="mb-4 flex flex-wrap gap-3"><label className="relative min-w-0 flex-1"><Search size={17} className="absolute left-3 top-3 text-brand" aria-hidden /><span className="sr-only">Search team</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or email" className="w-full rounded-xl border border-ink/15 py-2.5 pl-10 pr-3 text-sm" /></label><select aria-label="Filter members by status" value={filter} onChange={event => setFilter(event.target.value)} className="rounded-xl border border-ink/15 px-3 py-2 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option></select></div>
        <ul className="space-y-3">
          {visible.map((m) => (
            <li
              key={m.id}
              className="panel team-member flex flex-wrap items-center gap-3 rounded-xl p-4"
            >
              <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                {m.role === 'admin' ? (
                  <ShieldCheck size={18} className="text-brand" />
                ) : (
                  <User size={18} className="text-brand" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{m.full_name ?? m.email}</p>
                <p className="text-xs text-ink/60 flex items-center gap-1 break-all">
                  <Mail size={11} className="shrink-0" /> {m.email}
                </p>
                <span className={`status-badge mt-2 ${status(m) === 'Active' ? 'status-live' : status(m) === 'Invited' ? 'status-pending' : ''}`}>{status(m)}{m.id === currentUserId ? ' · You' : ''}</span>
              </div>
              <select
                value={m.role}
                onChange={(e) => changeRole(m.id, e.target.value as Role)}
                disabled={busy || locked || m.id === currentUserId || m.active === false}
                aria-label={`Role for ${m.full_name ?? m.email}`}
                className="rounded-lg border border-ink/20 px-2 py-1.5 text-xs"
              >
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
              <button
                onClick={() => m.active === false ? restore(m.id) : remove(m.id)}
                disabled={busy || locked || m.id === currentUserId}
                className="p-2 rounded-lg hover:bg-ink/10 text-ink disabled:opacity-30"
                title={m.active === false ? 'Restore access' : 'Deactivate access'}
                aria-label={`${m.active === false ? 'Restore' : 'Deactivate'} editorial access for ${m.full_name ?? m.email}`}
              >
                {m.active === false ? <RotateCcw size={18} /> : <UserRoundMinus size={18} />}
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 && <p className="panel rounded-xl p-8 text-center text-sm text-ink/60">No members match this search.</p>}
        <p className="mt-4 text-xs leading-relaxed text-ink/60">Deactivating a member preserves their publications and author credit. Invited means the account email has not yet been confirmed; link expiry depends on your email settings.</p>
      </div>
      </div>
    </div>
  );
}
