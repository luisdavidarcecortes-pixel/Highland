'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { isDemoMode } from '@/lib/demo';
import { AdminSignOut } from '@/components/admin-sign-out';
import { requestJson } from '@/lib/request-json';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [accessIssue, setAccessIssue] = useState(false);

  // The confirm route redirects here with ?error=… instead of failing silently.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'link') {
      setError('That link is expired or was already used. Ask an admin to send a new invitation.');
    } else if (params.get('error') === 'demo') {
      setError('Demo mode has no accounts: set up Supabase to access the panel.');
    } else if (params.get('error') === 'membership' || params.get('error') === 'inactive') {
      setAccessIssue(true);
      setError(params.get('error') === 'inactive' ? 'Your editorial access has been deactivated. Contact an administrator if this is unexpected.' : 'Your account is valid, but it is not a member of the newspaper team. Ask an administrator for access.');
    } else if (params.get('error') === 'unavailable') {
      setError('Account services are temporarily unavailable. Please retry in a moment.');
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Demo mode has no accounts: set up Supabase to access the panel.');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) { setError(authError.status && authError.status < 500 ? 'Wrong email or password.' : 'Sign-in services are temporarily unavailable. Please retry.'); return; }
      const session = await requestJson<{ user: { role: string; aal: string } }>('/api/session');
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      router.replace((session.user.role === 'admin' && session.user.aal !== 'aal2') || (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') ? '/admin/account' : '/admin');
      router.refresh();
    } catch (error) {
      setAccessIssue(true);
      setError(error instanceof Error ? error.message : 'Could not complete sign-in. Please retry.');
    } finally { setBusy(false); }
  }

  async function handleForgot() {
    setError(null);
    setNotice(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Demo mode has no accounts: set up Supabase to access the panel.');
      return;
    }
    if (!email.trim()) {
      setError('Write your email above, then click "Forgot your password?".');
      return;
    }
    setResetting(true);
    try {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/set-password`,
    });
    setResetting(false);
    // Always the same wording: revealing whether an address has an account
    // would let anyone enumerate the newspaper team.
    setNotice(
      resetError
        ? resetError.message
        : 'If that address belongs to the team, we sent it a link to set a new password.',
    );
    } catch { setError('Could not request a reset link. Check your connection and retry.'); }
    finally { setResetting(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/" className="mb-8 inline-flex text-sm font-semibold text-brand hover:underline">← Back to the newspaper</Link>
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
            autoComplete="email"
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-ink/20 px-3.5 py-2.5 bg-paper/50 text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-accent font-semibold">
            {error}
          </p>
        )}
        {accessIssue && <AdminSignOut />}
        {notice && (
          <p role="status" className="text-sm rounded-lg bg-brand/5 border border-brand/20 px-3 py-2">
            {notice}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-3 font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 shadow-sm"
        >
          <LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={handleForgot}
          disabled={resetting}
          className="w-full text-sm font-semibold text-ink/60 hover:text-ink hover:underline disabled:opacity-50"
        >
          {resetting ? 'Sending…' : 'Forgot your password?'}
        </button>
      </form>
    </div>
  );
}
