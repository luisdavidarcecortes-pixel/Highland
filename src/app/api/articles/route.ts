import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/auth';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';

async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  return { user };
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await req.json();
  const title = String(body.title ?? '').trim();
  const text = String(body.body ?? '').trim();
  if (!title || !text) {
    return NextResponse.json({ error: 'Title and body are required.' }, { status: 400 });
  }

  const slug = `${slugify(title)}-${Date.now().toString(36)}`;

  const { data, error: dbErr } = await supabase
    .from('articles')
    .insert({
      slug,
      title,
      excerpt: body.excerpt ? String(body.excerpt) : null,
      body: text,
      image_url: body.image_url ? String(body.image_url) : null,
      video_url: body.video_url ? String(body.video_url) : null,
      audio_url: body.audio_url ? String(body.audio_url) : null,
      author_id: user.id,
      published: Boolean(body.published),
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ article: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await req.json();
  const { id, published } = body as { id?: string; published?: boolean };
  if (!id || typeof published !== 'boolean') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const { error: dbErr } = await supabase
    .from('articles')
    .update({ published })
    .eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error: dbErr } = await supabase.from('articles').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
