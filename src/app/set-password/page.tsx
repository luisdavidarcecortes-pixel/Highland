'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { isDemoMode } from '@/lib/demo';

/**
 * Sets the password of an invited (or recovering) account.
 *
 * Supabase's default email template redirects with the session in the URL
 * hash (#access_token=…), which only the browser can see; the ?code= flow is
 * already turned into cookies by /auth/confirm. Both arrive here.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }
    let cancelled = false;

    async function absorbHashSession() {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase!
          .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .catch(() => undefined);
        // Never leave tokens in the address bar / history.
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    (async () => {
      try {
        await absorbHashSession();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setHasSession(Boolean(data.user));
      } catch {
        if (!cancelled) { setHasSession(false); setError('Could not verify this link. Check your connection and try again.'); }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Demo mode has no accounts: set up Supabase to use the panel.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); return; }
      router.replace('/admin'); router.refresh();
    } catch { setError('Could not save your password. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="public-page mx-auto max-w-md px-4 py-12">
      <div className="text-center">
        <p className="editorial-kicker mb-2">Secure portal</p>
        <h1 className="masthead text-4xl font-bold">Choose your password</h1>
        <p className="text-ink/60 mt-2 text-sm">
          Finish setting up your newspaper account. You will use this password to sign in.
        </p>
      </div>

      {isDemoMode() && (
        <p className="mt-6 text-sm text-center rounded-xl bg-accent/10 border border-accent/40 px-4 py-3">
          Demo mode active: there are no real accounts to set up.
        </p>
      )}

      {ready && !hasSession && (
        <div className="mt-6 rounded-2xl border border-ink/15 bg-white p-6 text-center shadow-card">
          <p className="text-sm text-ink/70">
            This link is expired or already used.
          </p>
          <Link
            href="/admin/login"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-brand text-paper px-5 py-2.5 text-sm font-semibold hover:bg-brand-dark"
          >
            Go to sign in
          </Link>
        </div>
      )}

      {ready && hasSession && (
        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl border border-ink/15 bg-white p-6 md:p-8 shadow-card"
        >
          <div>
            <label className="block text-sm font-semibold mb-1.5" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-ink/20 px-3.5 py-2.5 bg-paper/50 text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" htmlFor="confirm">
              Repeat password
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-ink/20 px-3.5 py-2.5 bg-paper/50 text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-accent font-semibold">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-3 font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 shadow-sm"
          >
            <KeyRound size={18} /> {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </div>
  );
}
