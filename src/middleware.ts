import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { boundedFetch } from './lib/bounded-fetch';
import { withDeadline } from './lib/deadline';

/**
 * Refresca la sesión de Supabase en cada petición y protege /admin.
 * Sin variables de entorno (modo demo) no hace nada.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    global: { fetch: boundedFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  let user;
  try {
    const result = await withDeadline(supabase.auth.getUser());
    if (result.error && (!result.error.status || result.error.status >= 500 || result.error.status === 429)) throw result.error;
    user = result.data.user;
  } catch {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Account services are temporarily unavailable. Please retry.' }, { status: 503, headers: { 'Retry-After': '5' } });
    }
    // Render the login's retry message rather than an unhandled middleware error.
    const retryUrl = request.nextUrl.clone();
    retryUrl.pathname = '/admin/login';
    retryUrl.search = '?error=unavailable';
    return NextResponse.rewrite(retryUrl, { status: 503, headers: { 'Retry-After': '5' } });
  }

  const { pathname } = request.nextUrl;
  if (!user && pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.search = '';
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/admin',
    '/api/analyze-edition',
    '/api/detect-page-numbers',
    '/api/editions/:path*',
    '/api/articles/:path*',
    '/api/team/:path*',
    '/api/upload-image',
    '/api/cleanup',
    '/api/session',
    '/api/account',
  ],
};
