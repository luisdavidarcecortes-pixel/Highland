import 'server-only';
import { cache } from 'react';
import { getSupabaseServerClient } from './supabase-server';
import type { ProfileLite, Role } from './types';
import { withDeadline } from './deadline';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  fullName: string | null;
  aal: 'aal1' | 'aal2';
}
export type SessionState =
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'anonymous' | 'membership' | 'inactive' | 'unavailable'; user?: never };

export const getSessionState = cache(async function getSessionState(): Promise<SessionState> {
  try {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return { status: 'anonymous' };
    const { data, error } = await withDeadline(supabase.auth.getUser());
    if (error) return { status: error.status && error.status < 500 && error.status !== 429 ? 'anonymous' : 'unavailable' };
    const user = data.user;
    if (!user) return { status: 'anonymous' };
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('id, full_name, role, active').eq('id', user.id).maybeSingle();
    if (profileError) return { status: 'unavailable' };
    if (!profile) return { status: 'membership' };
    if (!profile.active) return { status: 'inactive' };
    if (profile.role !== 'admin' && profile.role !== 'editor') return { status: 'membership' };
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) return { status: 'unavailable' };
    return { status: 'authenticated', user: {
      id: user.id, email: user.email ?? '', role: profile.role,
      fullName: profile.full_name, aal: assurance.currentLevel === 'aal2' ? 'aal2' : 'aal1',
    } };
  } catch {
    return { status: 'unavailable' };
  }
});

export class SessionAccessError extends Error {
  constructor(public status: 403 | 503, public code: string, message: string) { super(message); }
}
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSessionState();
  if (session.status === 'unavailable') throw new SessionAccessError(503, 'unavailable', 'Account services are temporarily unavailable. Please retry.');
  if (session.status === 'membership' || session.status === 'inactive') throw new SessionAccessError(403, session.status, session.status === 'inactive' ? 'Your editorial access has been deactivated.' : 'This account is not a member of the newspaper team.');
  return session.user ?? null;
});
export async function isAdmin() { return (await getSessionUser())?.role === 'admin'; }
export type { ProfileLite };
