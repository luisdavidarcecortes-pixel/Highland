'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, ShieldCheck, User, Trash2, Mail } from 'lucide-react';
import type { ProfileLite, Role } from '@/lib/types';
import { isDemoMode } from '@/lib/demo';

export function TeamManager({
  team,
  currentUserId,
}: {
  team: ProfileLite[];
  demo: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [invite, setInvite] = useState({ email: '', fullName: '', role: 'editor' as Role });

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (isDemoMode()) {
      setMsg('Demo mode: set up Supabase to invite real editors.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
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
    await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Remove this person from the team? They will still be able to read, but no longer edit.')) return;
    await fetch(`/api/team?id=${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-8">
      <form
        onSubmit={handleInvite}
        data-lg-surface
        className="lg-glass rounded-xl border border-ink/10 p-5 space-y-3 h-fit"
      >
        <h2 className="masthead text-xl font-bold">Invite an editor</h2>
        <div>
          <label className="block text-xs font-semibold mb-1">Email *</label>
          <input
            type="email"
            required
            value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })}
            placeholder="student@school.edu"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Name</label>
          <input
            value={invite.fullName}
            onChange={(e) => setInvite({ ...invite, fullName: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Role</label>
          <select
            value={invite.role}
            onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          >
            <option value="editor">Editor (writes and uploads drafts)</option>
            <option value="admin">Admin (publishes and manages the team)</option>
          </select>
        </div>
        {msg && <p className="text-sm rounded-lg bg-paper px-3 py-2">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50"
        >
          <UserPlus size={16} /> {busy ? 'Sending…' : 'Send invitation'}
        </button>
      </form>

      <div>
        <h2 className="masthead text-xl font-bold mb-4">Team</h2>
        <ul className="space-y-3">
          {team.map((m) => (
            <li
              key={m.id}
              data-lg-static
              className="lg-glass flex items-center gap-3 rounded-xl border border-ink/10 p-3"
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
                <p className="text-xs text-ink/60 flex items-center gap-1">
                  <Mail size={11} /> {m.email}
                </p>
              </div>
              <select
                value={m.role}
                onChange={(e) => changeRole(m.id, e.target.value as Role)}
                disabled={m.id === currentUserId}
                className="rounded-lg border border-ink/20 px-2 py-1.5 text-xs"
              >
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
              <button
                onClick={() => remove(m.id)}
                disabled={m.id === currentUserId}
                className="p-2 rounded-lg hover:bg-ink/10 text-ink disabled:opacity-30"
                title="Remove"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
