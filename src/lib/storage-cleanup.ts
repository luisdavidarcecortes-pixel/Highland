import 'server-only';
import { getSupabaseAdminClient } from './supabase-server';

/** Never remove an object still referenced by an edition or article. */
export async function cleanupObjects(paths: string[]): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 'File cleanup requires the server service key.';
  for (const path of Array.from(new Set(paths.filter(Boolean)))) {
    const { data: unused, error } = await admin.rpc('newspaper_object_unused', { object_path: path });
    if (error) return 'Files were saved, but cleanup needs the database security migration.';
    if (unused !== true) continue;
    const { error: removeError } = await admin.storage.from('newspaper').remove([path]);
    if (removeError) return 'An unused file could not be removed. Please retry cleanup later.';
  }
  return null;
}
