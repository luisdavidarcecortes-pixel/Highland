import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

/**
 * Supabase reads must never go through Next's Data Cache.
 *
 * Next patches the global fetch and caches GET responses, which for a CMS is
 * actively harmful: we saw an edition that had been deleted from the database
 * keep rendering (its PDF was already gone, so the reader showed "1 / 1" and
 * "The PDF could not be loaded"), and a freshly published edition stay
 * invisible. Passing `cache: 'no-store'` keeps every read live.
 */
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: 'no-store' });
}

/**
 * Cliente de Supabase para el servidor (Server Components / Route Handlers).
 * Si no hay variables de entorno, devuelve null → MODO DEMO.
 */
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    global: { fetch: noStoreFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component: the middleware refreshes the session.
        }
      },
    },
  });
}

/** Admin client (service role) for user-management operations. */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  // Dynamic import so supabase-js is not loaded in the client bundle.
  // Este archivo solo se usa en Route Handlers del servidor.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch },
  });
}

/**
 * Anonymous client WITHOUT the visitor's session cookies, for public reads
 * (published editions/articles). Public pages must never send the user's JWT:
 * a just-refreshed token can be rejected by clock skew ("JWT issued at
 * future") and crash the render or 404 the page for logged-in visitors.
 */
export function getSupabaseAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStoreFetch },
  });
}
