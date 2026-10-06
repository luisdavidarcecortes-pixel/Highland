'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { isDemoMode } from '@/lib/demo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Demo mode has no accounts: set up Supabase to access the panel.');
      return;
    }
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) {
      setError('Wrong email or password.');
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="masthead text-3xl font-bold text-center">Editors' panel</h1>
      <p className="text-center text-ink/60 mt-2 text-sm">
        Sign in with your newspaper team account.
      </p>

      {isDemoMode() && (
        <p className="mt-6 text-sm text-center rounded-lg bg-accent/10 border border-accent/40 px-3 py-2">
          Demo mode active: no real accounts. Set up Supabase (README).
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        data-lg-surface
        className="lg-glass mt-8 space-y-4 rounded-2xl border border-ink/15 p-5"
      >
        <div>
          <label className="block text-sm font-semibold mb-1" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="teacher@school.edu"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-ink font-semibold">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-2.5 font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
