import 'server-only';

import type { Edition } from './types';
import { DEMO_EDITIONS } from './demo-data';
import { isDemoMode } from './demo';
import { getSupabaseServerClient, getSupabaseAnonClient } from './supabase-server';

/** Published issues, newest first. Public pages never send the visitor's JWT. */
export async function getPublishedEditions(): Promise<Edition[]> {
  if (isDemoMode()) return DEMO_EDITIONS.filter((e) => e.published);
  const supabase = getSupabaseAnonClient() ?? getSupabaseServerClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('editions')
      .select('*')
      .eq('published', true)
      .order('edition_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Edition[];
  } catch {
    // A broken session (e.g. clock skew: "JWT issued at future") must never
    // crash a public page — render it empty instead.
    return [];
  }
}

/** Todas las ediciones (incluye borradores). Solo para el panel admin. */
export async function getAllEditions(): Promise<Edition[]> {
  if (isDemoMode()) return DEMO_EDITIONS;
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('editions')
    .select('*')
    .order('edition_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Edition[];
}

export async function getEditionById(id: string): Promise<Edition | null> {
  if (isDemoMode()) return DEMO_EDITIONS.find((e) => e.id === id) ?? null;
  const supabase = getSupabaseAnonClient() ?? getSupabaseServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('editions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Edition | null) ?? null;
  } catch {
    // Clock-skew or session errors must not crash the reader page.
    return null;
  }
}
