import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
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

  const body = await req.json();
  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = String(body.fullName ?? '').trim();
  const role = body.role === 'admin' ? 'admin' : 'editor';
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl,
  });
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });

  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: fullName || null,
      role,
    });
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

  await admin.auth.admin.deleteUser(id);
  const { error: dbErr } = await supabase.from('profiles').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
