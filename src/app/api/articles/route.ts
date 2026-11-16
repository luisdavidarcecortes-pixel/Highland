import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { apiSession } from '@/lib/api-session';
import { slugify } from '@/lib/utils';
import { mediaPath } from '@/lib/media';
import { cleanupObjects } from '@/lib/storage-cleanup';
import { articleInputError } from '@/lib/article-input';
import { serverError } from '@/lib/api-error';

export const runtime = 'nodejs';

const requireUser = apiSession;

/** A malformed body must answer 400, never crash the handler with a 500. */
async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });

  const inputError = articleInputError(body);
  if (inputError) return NextResponse.json({ error: inputError }, { status: 400 });

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
      image_path: mediaPath(body.image_url ? String(body.image_url) : null),
      video_url: body.video_url ? String(body.video_url) : null,
      audio_url: body.audio_url ? String(body.audio_url) : null,
      author_id: user.id,
      published: body.published === true,
    })
    .select()
    .single();

  if (dbErr) return serverError('articles', dbErr);
  return NextResponse.json({ article: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });

  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'Missing article id.' }, { status: 400 });
  const { data: existing, error: findError } = await supabase.from('articles').select('author_id,image_url,image_path').eq('id', id).maybeSingle();
  if (findError) return serverError('articles', findError);
  if (!existing) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });

  // Ownership is checked before ANY change, including the publication flag:
  // an editor must not publish or unpublish a story written by somebody else.
  if (user.role !== 'admin' && existing.author_id !== user.id) {
    return NextResponse.json({ error: 'Only the author or an admin can edit this article.' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.published === 'boolean') updates.published = body.published;
  if ('title' in body || 'body' in body) {
    const inputError = articleInputError(body);
    if (inputError) return NextResponse.json({ error: inputError }, { status: 400 });
    const title = String(body.title ?? '').trim();
    const text = String(body.body ?? '').trim();
    if (!title || !text) return NextResponse.json({ error: 'Title and body are required.' }, { status: 400 });
    Object.assign(updates, { title, body: text, excerpt: String(body.excerpt ?? '').trim() || null,
      image_url: String(body.image_url ?? '').trim() || null,
      image_path: mediaPath(String(body.image_url ?? '').trim()),
      video_url: String(body.video_url ?? '').trim() || null,
      audio_url: String(body.audio_url ?? '').trim() || null });
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No changes supplied.' }, { status: 400 });
  const { data, error: dbErr } = await supabase.from('articles').update(updates).eq('id', id).select('id');
  if (dbErr) return serverError('articles', dbErr);
  if (!data?.length) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
  const oldPath = existing.image_path || mediaPath(existing.image_url);
  const warning = 'image_url' in updates && updates.image_url !== existing.image_url && oldPath ? await cleanupObjects([oldPath]) : null;
  return NextResponse.json({ ok: true, warning });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: existing, error: findErr } = await supabase
    .from('articles')
    .select('id, author_id, image_path, image_url')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return serverError('articles', findErr);
  if (!existing) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
  if (user.role !== 'admin' && existing.author_id !== user.id) {
    return NextResponse.json(
      { error: 'Only the author or an admin can delete this article.' },
      { status: 403 },
    );
  }
  // An author may withdraw their own story, but an admin removing somebody
  // else’s work needs a second factor.
  if (user.role === 'admin' && existing.author_id !== user.id && user.aal !== 'aal2') {
    return NextResponse.json(
      { error: 'Deleting another member’s article requires two-factor verification. Enable it in your account settings.' },
      { status: 403 },
    );
  }

  const { error: dbErr } = await supabase.from('articles').delete().eq('id', id);
  if (dbErr) return serverError('articles', dbErr);
  const oldPath = existing.image_path || mediaPath(existing.image_url);
  const warning = oldPath ? await cleanupObjects([oldPath]) : null;
  return NextResponse.json({ ok: true, warning });
}
