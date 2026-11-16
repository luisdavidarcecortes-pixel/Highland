import { NextRequest, NextResponse } from 'next/server';
import { apiSession } from '@/lib/api-session';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { isOwnedUpload } from '@/lib/media';
import { cleanupObjects } from '@/lib/storage-cleanup';

export async function POST(req: NextRequest) {
  const { user, error: sessionError } = await apiSession();
  if (sessionError || !user) return sessionError!;
  const body = await req.json().catch(() => null);
  const paths: unknown = body?.paths;
  if (!Array.isArray(paths) || paths.length > 10 || !paths.every(p => typeof p === 'string' && ['articles', 'editions', 'covers'].some(folder => isOwnedUpload(p, user.id, folder)))) {
    return NextResponse.json({ error: 'Invalid upload paths' }, { status: 400 });
  }
  const supabase = await getSupabaseServerClient();
  const result = await supabase?.rpc('owns_newspaper_uploads', { object_paths: paths });
  if (!result || result.error || result.data !== true) return NextResponse.json({ error: 'You do not own these files.' }, { status: 403 });
  const warning = await cleanupObjects(paths as string[]);
  return NextResponse.json({ ok: !warning, warning }, { status: warning ? 503 : 200 });
}
