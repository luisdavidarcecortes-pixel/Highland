import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/auth';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** POST multipart { image } → { url } — uploads a news photo to Storage. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const form = await req.formData();
  const image = form.get('image') as File | null;
  if (!image || image.size === 0) {
    return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image is larger than 8 MB.' }, { status: 400 });
  }
  if (!ALLOWED.includes(image.type)) {
    return NextResponse.json(
      { error: 'Format not allowed. Use JPG, PNG, WebP or GIF.' },
      { status: 400 }
    );
  }

  const ext = EXT[image.type] ?? 'jpg';
  const path = `articles/${Date.now()}-${slugify(image.name.replace(/\.[^.]+$/, '')) || 'photo'}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('newspaper')
    .upload(path, image, { contentType: image.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data } = supabase.storage.from('newspaper').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
