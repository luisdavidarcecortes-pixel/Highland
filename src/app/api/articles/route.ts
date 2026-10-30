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

/** A malformed body must answer 400, never crash the handler with a 500. */
async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });

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

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });

  const id = String(body.id ?? '').trim();
  const published = body.published;
  if (!id || typeof published !== 'boolean') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  // `.select()` is what makes "no row changed" visible: RLS silently filters
  // rows, so an editor updating someone else's article got {ok:true} before.
  const { data, error: dbErr } = await supabase
    .from('articles')
    .update({ published })
    .eq('id', id)
    .select('id');
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: existing, error: findErr } = await supabase
    .from('articles')
    .select('id, author_id')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
  if (user.role !== 'admin' && existing.author_id !== user.id) {
    return NextResponse.json(
      { error: 'Only the author or an admin can delete this article.' },
      { status: 403 },
    );
  }

  const { error: dbErr } = await supabase.from('articles').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
