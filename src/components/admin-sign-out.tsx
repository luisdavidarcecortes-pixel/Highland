'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

/** Signs out of Supabase and returns to the login screen. */
export function AdminSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut().catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-ink/5 disabled:opacity-50"
    >
      <LogOut size={15} /> {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
