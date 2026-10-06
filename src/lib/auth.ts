import 'server-only';

import { getSupabaseServerClient } from './supabase-server';
import type { ProfileLite, Role } from './types';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  fullName: string | null;
}

/** Returns the authenticated user with their role, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  let user: { id: string; email?: string | null } | null = null;
  try {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  } catch {
    // A rejected session (e.g. clock skew: "JWT issued at future") just means
    // "not authenticated" — never a crash. The middleware will refresh it.
    return null;
  }
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (profile) {
    return {
      id: user.id,
      email: (profile.email as string) ?? user.email ?? '',
      role: (profile.role as Role) ?? 'editor',
      fullName: (profile.full_name as string | null) ?? null,
    }
  }

  return {
    id: user.id,
    email: user.email ?? '',
    role: 'editor',
    fullName: null,
  };
}

export async function isAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return user?.role === 'admin';
}

export type { ProfileLite };
