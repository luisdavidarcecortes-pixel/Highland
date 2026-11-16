import 'server-only';

import type { ProfileLite } from './types';
import { DEMO_TEAM } from './demo-data';
import { isDemoMode } from './demo';
import { getSupabaseServerClient } from './supabase-server';

/** Editorial team list (profiles), ordered by sign-up date. */
export async function getTeam(): Promise<ProfileLite[]> {
  if (isDemoMode()) return DEMO_TEAM;
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_editorial_team');
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileLite[];
}
