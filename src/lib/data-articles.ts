import 'server-only';
import { cache } from 'react';
import type { Article } from './types';
import { DEMO_ARTICLES } from './demo-data';
import { isDemoMode } from './demo';
import { protectedMediaUrl } from './media';
import { getSupabaseServerClient, getSupabaseAnonClient } from './supabase-server';

function protect(row: Article & { image_path?: string }): Article { return { ...row, image_url: protectedMediaUrl(row.image_url, row.image_path) }; }
function unavailable(error: unknown): never {
  console.error('[data-articles] database read failed:', error);
  throw new Error('The newspaper service is temporarily unavailable. Please try again.');
}
export const getPublishedArticles = cache(async (): Promise<Article[]> => {
  if (isDemoMode()) return DEMO_ARTICLES.filter(row => row.published);
  const supabase = getSupabaseAnonClient();
  if (!supabase) return unavailable('Missing database configuration');
  const { data, error } = await supabase.from('articles').select('*').eq('published', true).order('created_at', { ascending: false });
  if (error) return unavailable(error.message);
  return (data ?? []).map(protect);
});
export async function getAllArticles(): Promise<Article[]> {
  if (isDemoMode()) return DEMO_ARTICLES;
  const supabase = await getSupabaseServerClient();
  if (!supabase) return unavailable('Missing database configuration');
  const { data, error } = await supabase.from('articles').select('*').order('created_at', { ascending: false });
  if (error) return unavailable(error.message);
  return (data ?? []).map(protect);
}
export const getArticleBySlug = cache(async (slug: string): Promise<Article | null> => {
  if (isDemoMode()) return DEMO_ARTICLES.find(row => row.slug === slug) ?? null;
  const supabase = getSupabaseAnonClient();
  if (!supabase) return unavailable('Missing database configuration');
  const { data, error } = await supabase.from('articles').select('*').eq('slug', slug).eq('published', true).maybeSingle();
  if (error) return unavailable(error.message);
  return data ? protect(data) : null;
});
