import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { authDestination } from '@/lib/redirect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Landing point for the links Supabase sends by email (invite, recovery).
 *
 * Supabase can hand the session over in two shapes and both are accepted:
 *   • ?code=…            → PKCE / SSR flow, exchanged for cookies here.
 *   • ?token_hash=…&type=… → hashed-token flow (custom email templates).
 * The implicit flow (#access_token=…) never reaches the server, so
 * /admin/set-password finishes that one in the browser.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const next = authDestination(searchParams.get('next'));

  // The link carries a single-use token in the query string: the answer must
  // not be cached, and it must not leak the token to the next site.
  const noStore = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set('Cache-Control', noStore['Cache-Control']);
    response.headers.set('Referrer-Policy', noStore['Referrer-Policy']);
    return response;
  };

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return redirect('/admin/login?error=demo');
  }

  const code = searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(next);
    return redirect('/admin/login?error=link');
  }

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  if (tokenHash && type && ['invite', 'recovery', 'email'].includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return redirect(next);
  }

  if (tokenHash || type || searchParams.has('error')) {
    return redirect('/admin/login?error=link');
  }
  // A redirect without a fragment preserves the incoming #access_token hash.
  // The browser on /set-password absorbs it; fragments never reach this route.
  return redirect('/set-password');
}
