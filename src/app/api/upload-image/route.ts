import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { apiSession } from '@/lib/api-session';
import { mediaUrl } from '@/lib/media';
import { serverError } from '@/lib/api-error';

export const runtime = 'nodejs';

// Vercel caps a serverless request body at 4.5 MB, so anything larger than
// this would pass validation here and then die at the platform with an opaque
// 413. Rejecting early gives the editor a message they can act on.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Images are served as they are (the optimizer cannot reach /api/media), so
 *  they are scaled down here instead of at the edge. */
const MAX_WIDTH = 1600;
const QUALITY = 82;

/**
 * POST multipart { image } → { url } — uploads a news photo to Storage.
 *
 * The file is decoded before it is stored: the declared MIME type is not
 * trusted, and the picture is scaled to a sensible width so the public pages
 * do not download a phone camera original.
 */
export async function POST(req: NextRequest) {
  const { user, error: sessionError } = await apiSession();
  if (sessionError || !user) return sessionError!;

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  const image = form.get('image') as File | null;
  if (!image || image.size === 0) {
    return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image is larger than 4 MB.' }, { status: 400 });
  }
  if (!ALLOWED.includes(image.type)) {
    return NextResponse.json(
      { error: 'Format not allowed. Use JPG, PNG, WebP or GIF.' },
      { status: 400 }
    );
  }

  let body: Buffer;
  let contentType: string;
  let ext: string;

  if (image.type === 'image/gif') {
    // Animated GIFs are stored untouched: converting them would drop the animation.
    body = Buffer.from(await image.arrayBuffer());
    contentType = 'image/gif';
    ext = 'gif';
  } else {
    try {
      const normalized = await sharp(Buffer.from(await image.arrayBuffer()), { failOn: 'none' })
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();
      body = normalized;
      contentType = 'image/webp';
      ext = 'webp';
    } catch {
      // The file is not a picture, whatever it claimed to be.
      return NextResponse.json({ error: 'That file could not be read as an image.' }, { status: 400 });
    }
  }

  const path = `articles/${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('newspaper')
    .upload(path, body, { contentType, upsert: false });
  if (upErr) return serverError('upload-image', upErr);

  return NextResponse.json({ url: mediaUrl(path), path }, { status: 201 });
}
