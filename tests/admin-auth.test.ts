import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ client: vi.fn(), create: vi.fn(), user: vi.fn(), profile: vi.fn(), assurance: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('../src/lib/supabase-server', () => ({ getSupabaseServerClient: mock.client }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mock.create }));
import { getSessionState, getSessionUser } from '../src/lib/auth';
import { middleware } from '../src/middleware';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://local.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-only');
  mock.user.mockResolvedValue({ data: { user: { id: 'member-1', email: 'verified@example.test' } }, error: null });
  mock.profile.mockResolvedValue({ data: { id: 'member-1', full_name: 'Editor', email: 'untrusted@example.test', role: 'admin', active: true }, error: null });
  mock.assurance.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
  const client = { auth: { getUser: mock.user, mfa: { getAuthenticatorAssuranceLevel: mock.assurance } }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.profile }) }) }) };
  mock.client.mockResolvedValue(client); mock.create.mockReturnValue(client);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('admin account access states', () => {
  it('uses the verified account email', async () => {
    expect((await getSessionUser())?.email).toBe('verified@example.test');
  });
  it('distinguishes a valid account with no editorial membership', async () => {
    mock.profile.mockResolvedValue({ data: null, error: null });
    expect((await getSessionState()).status).toBe('membership');
    await expect(getSessionUser()).rejects.toMatchObject({ status: 403, code: 'membership' });
  });
  it('rejects an inactive profile despite a valid Auth session', async () => {
    mock.profile.mockResolvedValue({ data: { role: 'admin', active: false }, error: null });
    await expect(getSessionUser()).rejects.toMatchObject({ status: 403, code: 'inactive' });
  });
  it('does not confuse database failure with missing membership', async () => {
    mock.profile.mockResolvedValue({ data: null, error: { message: 'Database offline' } });
    await expect(getSessionUser()).rejects.toMatchObject({ status: 503, code: 'unavailable' });
  });
  it('handles an unexpected auth exception in middleware', async () => {
    mock.user.mockRejectedValue(new Error('Auth offline'));
    const response = await middleware(new NextRequest('https://paper.example/admin/team'));
    expect(response.status).toBe(503);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://paper.example/admin/login?error=unavailable');
  });
  it('bounds SDK retries even when getUser never resolves', async () => {
    vi.useFakeTimers(); mock.user.mockReturnValue(new Promise(() => {}));
    const result = middleware(new NextRequest('https://paper.example/api/team'));
    await vi.advanceTimersByTimeAsync(6001);
    const response = await result;
    expect(response.status).toBe(503); expect(response.headers.get('retry-after')).toBe('5');
  });
});
