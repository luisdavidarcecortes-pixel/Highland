'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { requestJson } from '@/lib/request-json';

export function AccountManager({ user, demo }: { user: SessionUser; demo: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(user.fullName ?? '');
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [factor, setFactor] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(user.aal === 'aal2');
  const [factorsReady, setFactorsReady] = useState(demo);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error('Account services unavailable.');
        const { data, error } = await client.auth.mfa.listFactors();
        if (error) throw error;
        if (!cancelled) { setFactor(data.totp.find(item => item.status === 'verified')?.id ?? null); setFactorsReady(true); }
      } catch { if (!cancelled) setMessage('Could not load security settings. Reload this page to retry.'); }
    })();
    return () => { cancelled = true; };
  }, [demo]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    if (demo) { setMessage('Demo preview: account changes are not saved.'); return; }
    setBusy(true); setMessage('');
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not complete this action. Please retry.'); }
    finally { setBusy(false); }
  }
  async function enroll() {
    const client = getSupabaseBrowserClient()!;
    // Discard abandoned, unverified enrollments before creating another one.
    const { data: factors, error: listError } = await client.auth.mfa.listFactors();
    if (listError) throw listError;
    for (const item of factors.all.filter(item => item.factor_type === 'totp' && item.status === 'unverified')) {
      const { error } = await client.auth.mfa.unenroll({ factorId: item.id });
      if (error) throw error;
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Highlander authenticator', issuer: 'The Highlander' });
    if (error) throw error;
    setFactor(data.id); setQr(data.totp.qr_code); setVerified(false);
  }
  async function verify() {
    if (!factor) return;
    const { error } = await getSupabaseBrowserClient()!.auth.mfa.challengeAndVerify({ factorId: factor, code });
    if (error) throw new Error('That code could not be verified. Use the current six-digit code and retry.');
    setVerified(true); setQr(null); setCode(''); setMessage('Two-factor verification complete. Team management is now available.'); router.refresh();
  }

  return <div className="space-y-6">
    {message && <p role="status" className="panel-note rounded-xl p-4">{message}</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="panel rounded-2xl p-6 md:p-8">
        <UserRound className="mb-4 text-brand" size={24} aria-hidden />
        <h2 className="text-xl font-bold">Your profile</h2>
        <p className="mt-2 text-sm text-ink/60">Your name appears in the editorial workspace.</p>
        <form className="mt-6 space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => { await requestJson('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: name }) }); setMessage('Profile saved.'); router.refresh(); }); }}>
          <label className="block text-sm font-semibold" htmlFor="account-name">Full name</label>
          <input id="account-name" required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} disabled={busy} className="admin-input" />
          <p className="text-sm text-ink/60">Role <span className="status-badge ml-2">{user.role}</span></p>
          <button disabled={busy} className="admin-primary">Save profile</button>
        </form>
        <form className="mt-7 space-y-4 border-t border-ink/10 pt-6" onSubmit={event => { event.preventDefault(); void run(async () => {
          const { error } = await getSupabaseBrowserClient()!.auth.updateUser({ email: email.trim() }, { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/admin` });
          if (error) throw error;
          setMessage('Check your email to confirm the change. Your current login email stays in use until verification is complete.');
        }); }}>
          <label htmlFor="account-email" className="block text-sm font-semibold">Login email</label>
          <input id="account-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className="admin-input" />
          <p className="text-xs leading-relaxed text-ink/60">Email changes require confirmation through your account email.</p>
          <button disabled={busy || email.trim() === user.email} className="admin-secondary">Request email change</button>
        </form>
      </section>
      <div className="space-y-6">
        <section className="panel rounded-2xl p-6 md:p-8">
          <ShieldCheck className="mb-4 text-brand" size={24} aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Two-factor authentication</h2><span className={`status-badge ${verified ? 'status-live' : 'status-pending'}`}>{verified ? 'Verified session' : factor && !qr ? 'Verification needed' : 'Set up required'}</span></div>
          <p className="mt-3 text-sm leading-relaxed text-ink/60">Use an authenticator app. Administrators must verify a code before inviting members or changing team access.</p>
          {qr && <div className="mt-5"><p className="mb-3 text-sm">Scan this code with your authenticator app, then enter the code it generates.</p>{/* Supabase supplies a data URI; no secret is sent to an image service. */}<img src={qr} alt="Authenticator setup QR code" className="h-48 w-48 rounded-xl bg-white p-3" /></div>}
          {factor && !verified ? <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); void run(verify); }}>
            <label htmlFor="mfa-code" className="block text-sm font-semibold">Authenticator code</label>
            <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} className="admin-input max-w-60 tracking-[.3em]" />
            <button disabled={busy || code.length !== 6} className="admin-primary">Verify code</button>
          </form> : !factor ? <button onClick={() => void run(enroll)} disabled={busy || !factorsReady} className="admin-primary mt-5">{factorsReady ? 'Set up authenticator' : 'Loading security settings…'}</button> : <p className="panel-note mt-5 rounded-xl p-3 text-sm">Your authenticator is active and this session is verified.</p>}
          {factor && verified && <button className="mt-5 text-sm font-semibold text-red-700 underline" disabled={busy} onClick={() => { if (confirm('Disable your authenticator? Team management will require you to set it up again.')) void run(async () => { const { error } = await getSupabaseBrowserClient()!.auth.mfa.unenroll({ factorId: factor }); if (error) throw error; setFactor(null); setVerified(false); router.refresh(); }); }}>Disable authenticator</button>}
        </section>
        <section className="panel rounded-2xl p-6 md:p-8">
          <KeyRound className="mb-4 text-brand" size={24} aria-hidden />
          <h2 className="text-xl font-bold">Password</h2><p className="mt-2 text-sm leading-relaxed text-ink/60">Receive a secure link at your current login email to choose a new password.</p>
          <button disabled={busy} className="admin-secondary mt-5" onClick={() => void run(async () => { const { error } = await getSupabaseBrowserClient()!.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/auth/confirm?next=/set-password` }); if (error) throw error; setMessage('Password reset link requested. Check your inbox.'); })}>Send password reset link</button>
        </section>
      </div>
    </div>
  </div>;
}
