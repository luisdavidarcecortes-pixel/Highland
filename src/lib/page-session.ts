import { redirect } from 'next/navigation';
import { getSessionState } from './auth';

export async function pageSession() {
  const state = await getSessionState();
  if (state.status === 'unavailable') throw new Error('Account services are temporarily unavailable. Please retry.');
  if (state.status !== 'authenticated') redirect(`/admin/login?error=${state.status}`);
  return state.user;
}
