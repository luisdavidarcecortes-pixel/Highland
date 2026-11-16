import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { apiSession } from '@/lib/api-session';
import { serverError } from '@/lib/api-error';

export const runtime = 'nodejs';

async function requireAdmin() {
  const { user, error } = await apiSession();
  if (error || !user) return { error: error! };
  if (user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only an admin can manage the team' }, { status: 403 }) };
  }
  if (user.aal !== 'aal2') return { error: NextResponse.json({ error: 'Verify two-factor authentication in Account & security before managing the team.', code: 'mfa_required' }, { status: 403 }) };
  return { user };
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const admin = getSupabaseAdminClient();
  const supabase = await getSupabaseServerClient();
  if (!admin || !supabase) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is missing on the server (see .env.example).' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
  const email = String((body as Record<string, unknown>).email ?? '').trim().toLowerCase();
  const fullName = String((body as Record<string, unknown>).fullName ?? '').trim();
  const role = (body as Record<string, unknown>).role === 'admin' ? 'admin' : 'editor';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || fullName.length > 100 || !['admin','editor'].includes(String((body as Record<string, unknown>).role ?? 'editor'))) return NextResponse.json({ error: 'Enter a valid email, name and role.' }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    // The invited account has no password yet: land on the page that sets one.
    redirectTo: `${siteUrl.replace(/\/$/, '')}/auth/confirm?next=/set-password`,
    data: { full_name: fullName || null },
  });
  if (inviteErr) return serverError('team', inviteErr, 'The invitation could not be sent. Try again in a few minutes.', 400);

  if (!data.user) return NextResponse.json({ error: 'The invitation service did not return an account. Please retry.' }, { status: 503 });
  if (data.user) {
    // The invite trigger already created an editor profile. This upsert must
    // run with the service role: the "self insert" policy requires
    // id = auth.uid(), which is false for the user being invited, so the
    // session client's upsert failed and the chosen role was silently dropped.
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: fullName || null,
      role,
      active: true,
    });
    if (profileErr) {
      // Never report success for a half-finished invite: without the profile
      // row the account would have no role at all.
      return NextResponse.json(
        { error: 'The invitation was sent, but its team settings could not be saved. Review the member in the team list before retrying.' },
        { status: 500 },
      );
    }
    const { error: historyError } = await admin.from('editorial_audit').insert({
      actor_id: user.id, actor_name: user.fullName || user.email,
      entity: 'profiles', record_id: data.user.id, action: 'invite',
      details: { name: fullName || email, role, active: true },
    });
    if (historyError) console.error('[team] invitation audit could not be recorded');
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  const { id, role, active } = body as { id?: string; role?: string; active?: boolean };
  if (id === user.id) return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || (role === undefined && active !== true) || (role !== undefined && role !== 'admin' && role !== 'editor') || (active !== undefined && active !== true)) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const { data: changed, error: dbErr } = await supabase
    .from('profiles')
    .update({ ...(role ? { role } : {}), ...(active === true ? { active: true } : {}) })
    .eq('id', id).select('id');
  if (dbErr) return serverError('team', dbErr);
  if (!changed?.length) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });

  // Reactivating a member also lifts the ban that closed their account.
  if (active === true) {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { error: unbanError } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
      if (unbanError) console.error('[team] could not lift the ban', unbanError.message);
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Account services unavailable.' }, { status: 503 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid member id' }, { status: 400 });
  if (id === user.id) return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });

  const { data: member, error: lookupError } = await supabase.from('profiles').select('id, active').eq('id', id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Could not verify this membership.' }, { status: 503 });
  if (!member) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });
  if (!member.active) return NextResponse.json({ ok: true });
  // Revoke database membership immediately. Keep Auth, uploads and attribution.
  const { data: changed, error: dbErr } = await supabase.from('profiles').update({ active: false }).eq('id', id).select('id');
  if (dbErr) return serverError('team', dbErr);
  if (!changed?.length) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 });
  // The account itself is closed too: without this the member keeps a valid
  // session (and a refresh token) and could still reach Supabase directly.
  const admin = getSupabaseAdminClient();
  if (admin) {
    const { error: banError } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
    if (banError) console.error('[team] could not close the account', banError.message);
  }
  return NextResponse.json({ ok: true });
}
