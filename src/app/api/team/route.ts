import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  if (user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only an admin can manage the team' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const admin = getSupabaseAdminClient();
  const supabase = getSupabaseServerClient();
  if (!admin || !supabase) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is missing on the server (see .env.example).' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
  const email = String((body as Record<string, unknown>).email ?? '').trim().toLowerCase();
  const fullName = String((body as Record<string, unknown>).fullName ?? '').trim();
  const role = (body as Record<string, unknown>).role === 'admin' ? 'admin' : 'editor';
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl,
    data: { full_name: fullName || null },
  });
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });

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
    });
    if (profileErr) {
      // Never report success for a half-finished invite: without the profile
      // row the account would have no role at all.
      await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json(
        { error: `The invitation could not be saved: ${profileErr.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await req.json();
  const { id, role } = body as { id?: string; role?: string };
  if (!id || (role !== 'admin' && role !== 'editor')) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return error!;

  const admin = getSupabaseAdminClient();
  const supabase = getSupabaseServerClient();
  if (!admin || !supabase) return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (id === user.id) return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });

  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    // Stopping here keeps the removal atomic-ish: deleting only the profile
    // would leave a live account that getSessionUser still recognises.
    return NextResponse.json(
      { error: `The account could not be removed: ${authErr.message}` },
      { status: 500 },
    );
  }
  const { error: dbErr } = await supabase.from('profiles').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
