import { createBrowserClient } from '@supabase/ssr';
import { sessionCookieOptions } from './session-cookie';

/**
 * Cliente de Supabase para el navegador (componentes cliente).
 * Si no hay variables de entorno, devuelve null → la app funciona en MODO DEMO.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey, {
    cookieOptions: sessionCookieOptions,
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const timeout = AbortSignal.timeout(15000);
      return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    } },
  });
}
