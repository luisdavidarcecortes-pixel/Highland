import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para el navegador (componentes cliente).
 * Si no hay variables de entorno, devuelve null → la app funciona en MODO DEMO.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
