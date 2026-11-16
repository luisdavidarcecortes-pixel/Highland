import 'server-only';
import { cache } from 'react';
import type { Edition } from './types';
import { DEMO_EDITIONS } from './demo-data';
import { isDemoMode } from './demo';
import { protectedMediaUrl } from './media';
import { getSupabaseServerClient, getSupabaseAnonClient } from './supabase-server';

function protect(row: Edition & { pdf_path?: string; cover_path?: string }): Edition { return { ...row, pdf_url: protectedMediaUrl(row.pdf_url, row.pdf_path)!, cover_url: protectedMediaUrl(row.cover_url, row.cover_path) }; }
function unavailable(error: unknown): never {
  console.error('[data-editions] database read failed:', error);
  throw new Error('The newspaper service is temporarily unavailable. Please try again.');
}
export const getPublishedEditions = cache(async (): Promise<Edition[]> => {
  if (isDemoMode()) return DEMO_EDITIONS.filter(row => row.published);
  const supabase = getSupabaseAnonClient();
  if (!supabase) return unavailable('Missing database configuration');
  const { data, error } = await supabase.from('editions').select('*').eq('published', true).order('edition_date', { ascending: false });
  if (error) return unavailable(error.message);
  return (data ?? []).map(protect);
});
export async function getAllEditions(): Promise<Edition[]> {
  if (isDemoMode()) return DEMO_EDITIONS;
  const supabase = await getSupabaseServerClient();
  if (!supabase) return unavailable('Missing database configuration');
  const { data, error } = await supabase.from('editions').select('*').order('edition_date', { ascending: false });
  if (error) return unavailable(error.message);
  return (data ?? []).map(protect);
}
export const getEditionById = cache(async (id: string): Promise<Edition | null> => {
  if (isDemoMode()) return DEMO_EDITIONS.find(row => row.id === id) ?? null;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return null;
  const supabase = getSupabaseAnonClient();
  if (!supabase) return unavailable('Missing database configuration');
  const { data, error } = await supabase.from('editions').select('*').eq('id', id).eq('published', true).maybeSingle();
  if (error) return unavailable(error.message);
  return data ? protect(data) : null;
});
