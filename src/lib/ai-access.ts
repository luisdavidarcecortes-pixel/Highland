import 'server-only';
import { NextResponse } from 'next/server';
import { apiSession } from './api-session';
import { getSupabaseServerClient } from './supabase-server';

/** Quotas are tied to a verified member and shared by every server instance. */
export async function requireAiAccess(scope: 'analyze' | 'detect') {
  const { error: sessionError } = await apiSession();
  if (sessionError) return sessionError;
  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'AI is unavailable.' }, { status: 503 });
  const { data, error } = await supabase.rpc('consume_ai_quota', { quota_scope: scope });
  if (error) return NextResponse.json({ error: 'AI quotas are unavailable. Apply the database security migration.' }, { status: 503 });
  if (data !== true) return NextResponse.json({ error: 'Too many AI requests. Try again in ten minutes.' }, { status: 429, headers: { 'Retry-After': '600' } });
  return null;
}
