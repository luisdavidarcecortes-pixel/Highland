import { NextResponse } from 'next/server';
import { getSessionUser, SessionAccessError } from './auth';

export async function apiSession() {
  try {
    const user = await getSessionUser();
    if (!user) return { error: NextResponse.json({ error: 'Sign in with an editorial account.', code: 'anonymous' }, { status: 401 }) };
    return { user };
  } catch (error) {
    if (error instanceof SessionAccessError) return { error: NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: error.status === 503 ? { 'Retry-After': '5' } : {} }) };
    return { error: NextResponse.json({ error: 'Account services are temporarily unavailable.', code: 'unavailable' }, { status: 503 }) };
  }
}
