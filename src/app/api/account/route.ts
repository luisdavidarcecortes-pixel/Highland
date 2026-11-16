import { NextRequest, NextResponse } from 'next/server';
import { apiSession } from '@/lib/api-session';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function PATCH(request: NextRequest) {
  const { user, error } = await apiSession();
  if (error || !user) return error!;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 100) {
    return NextResponse.json({ error: 'Use a name between 2 and 100 characters.' }, { status: 400 });
  }
  const client = await getSupabaseServerClient();
  if (!client) return NextResponse.json({ error: 'Account services unavailable.' }, { status: 503 });
  const { data, error: saveError } = await client.from('profiles').update({ full_name: body.fullName.trim() }).eq('id', user.id).select('id');
  if (saveError) return NextResponse.json({ error: 'Your name could not be saved. Please retry.' }, { status: 503 });
  if (!data?.length) return NextResponse.json({ error: 'Membership not found.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
