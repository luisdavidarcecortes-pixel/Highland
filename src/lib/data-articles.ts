import 'server-only';

import type { Article } from './types';
import { DEMO_ARTICLES } from './demo-data';
import { isDemoMode } from './demo';
import { getSupabaseServerClient, getSupabaseAnonClient } from './supabase-server';

/** Published articles, newest first. Public pages never send the visitor's JWT. */
export async function getPublishedArticles(): Promise<Article[]> {
  if (isDemoMode()) return DEMO_ARTICLES.filter((a) => a.published);
  const supabase = getSupabaseAnonClient() ?? getSupabaseServerClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Article[];
  } catch {
    // A broken session (e.g. clock skew) must never crash a public page.
    return [];
  }
}

/** All articles (including drafts). Admin panel only. */
export async function getAllArticles(): Promise<Article[]> {
  if (isDemoMode()) return DEMO_ARTICLES;
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Article[];
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  if (isDemoMode()) return DEMO_ARTICLES.find((a) => a.slug === slug) ?? null;
  const supabase = getSupabaseAnonClient() ?? getSupabaseServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Article | null) ?? null;
  } catch {
    return null;
  }
}
