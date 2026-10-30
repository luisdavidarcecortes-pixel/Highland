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
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center">
        <p className="editorial-kicker mb-2">Secure portal</p>
        <h1 className="masthead text-4xl font-bold">Editors' panel</h1>
        <p className="text-ink/60 mt-2 text-sm">
          Sign in with your newspaper team account to manage issues and news.
        </p>
      </div>

      {isDemoMode() && (
        <p className="mt-6 text-sm text-center rounded-xl bg-accent/10 border border-accent/40 px-4 py-3">
          Demo mode active: no real accounts. Set up Supabase (README).
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-5 rounded-2xl border border-ink/15 bg-white p-6 md:p-8 shadow-card"
      >
        <div>
          <label className="block text-sm font-semibold mb-1.5" htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-ink/20 px-3.5 py-2.5 bg-paper/50 text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="teacher@school.edu"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-ink/20 px-3.5 py-2.5 bg-paper/50 text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-accent font-semibold">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-3 font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 shadow-sm"
        >
          <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
