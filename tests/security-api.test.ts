import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authDestination } from '../src/lib/redirect';
import { isOwnedUpload, mediaPath } from '../src/lib/media';

const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), cleanup: vi.fn(), rpc: vi.fn(), admin: vi.fn(), ban: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/auth', () => ({ getSessionUser: mocks.user, SessionAccessError: class extends Error {} }));
vi.mock('../src/lib/supabase-server', () => ({ getSupabaseServerClient: mocks.client, getSupabaseAdminClient: mocks.admin }));
vi.mock('../src/lib/storage-cleanup', () => ({ cleanupObjects: mocks.cleanup }));
import { POST as createEdition } from '../src/app/api/editions/route';
import { PATCH as changeRole, DELETE as deactivateMember, POST as inviteMember } from '../src/app/api/team/route';
import { GET as confirm } from '../src/app/auth/confirm/route';
import { requireAiAccess } from '../src/lib/ai-access';
import { PATCH as editArticle } from '../src/app/api/articles/route';
import { DELETE as removeArticle } from '../src/app/api/articles/route';
import { DELETE as removeEdition } from '../src/app/api/editions/route';

const userId = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: userId, role: 'admin', aal: 'aal2' });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, auth: { exchangeCodeForSession: async () => ({ error: null }) } });
  mocks.ban.mockResolvedValue({ error: null });
  // getSupabaseAdminClient() is synchronous: it returns the client, not a promise.
  mocks.admin.mockReturnValue({ auth: { admin: { updateUserById: mocks.ban } } });
});
describe('account and upload boundaries', () => {
  it.each(['/\\external.example', '//external.example', 'https://external.example', '/%5cexternal.example', '/admin?next=evil'])('rejects the redirect %s', value => expect(authDestination(value)).toBe('/admin'));
  it('accepts the password destination', () => expect(authDestination('/set-password')).toBe('/set-password'));
  it('forwards implicit invitations to the browser password page', async () => {
    const response = await confirm(new NextRequest('https://paper.example/auth/confirm?next=/set-password'));
    expect(response.headers.get('location')).toBe('https://paper.example/set-password');
  });
  it('does not redirect a valid code to an attacker domain', async () => {
    const response = await confirm(new NextRequest('https://paper.example/auth/confirm?code=ok&next=%2F%5Cevil.example'));
    expect(response.headers.get('location')).toBe('https://paper.example/admin');
  });
  it('rejects an edition referencing someone else’s files before cleanup', async () => {
    const stamp = Date.now();
    const response = await createEdition(new NextRequest('https://paper.example/api/editions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Issue', number: 1, edition_date: '2026-11-03', school_year: '2026-27', pdf_path: `editions/22222222-2222-4222-8222-222222222222/${stamp}-issue.pdf`, cover_path: `covers/22222222-2222-4222-8222-222222222222/${stamp}-issue.jpg` }) }));
    expect(response.status).toBe(403); expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('does not trust a forged owner prefix without checking Storage', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const stamp = Date.now();
    const response = await createEdition(new NextRequest('https://paper.example/api/editions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Issue', number: 1, edition_date: '2026-11-03', school_year: '2026-27', pdf_path: `editions/${userId}/${stamp}-issue.pdf`, cover_path: `covers/${userId}/${stamp}-issue.jpg` }) }));
    expect(response.status).toBe(403); expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('accepts a slow upload that started more than ten minutes ago', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'saved' }, error: null }) }) }));
    mocks.client.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ createSignedUrl: async () => ({ error: null }) }) }, from: () => ({ insert }) });
    const stamp = Date.now() - 45 * 60 * 1000;
    const response = await createEdition(new NextRequest('https://paper.example/api/editions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Slow upload', number: 1, edition_date: '2026-11-03', school_year: '2026-27', pdf_path: `editions/${userId}/${stamp}-issue.pdf`, cover_path: `covers/${userId}/${stamp}-issue.jpg` }) }));
    expect(response.status).toBe(201); expect(insert).toHaveBeenCalledOnce();
  });
  it('returns an already saved retry instead of creating a duplicate draft', async () => {
    const stamp = Date.now(); const id = '22222222-2222-4222-8222-222222222222';
    const pdf = `editions/${userId}/${stamp}-issue.pdf`; const cover = `covers/${userId}/${stamp}-issue.jpg`;
    const insert = vi.fn();
    mocks.client.mockResolvedValue({ from: () => ({ insert, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id, created_by: userId, pdf_path: pdf, cover_path: cover }, error: null }) }) }) }) });
    const response = await createEdition(new NextRequest('https://paper.example/api/editions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: 'Retry', number: 1, edition_date: '2026-11-03', school_year: '2026-27', pdf_path: pdf, cover_path: cover }) }));
    expect(response.status).toBe(200); expect(insert).not.toHaveBeenCalled(); expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('keeps completed files when the metadata database is temporarily unavailable', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.client.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ createSignedUrl: async () => ({ error: null }) }) }, from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'Temporary failure' } }) }) }) }) });
    const stamp = Date.now();
    const response = await createEdition(new NextRequest('https://paper.example/api/editions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Retry', number: 1, edition_date: '2026-11-03', school_year: '2026-27', pdf_path: `editions/${userId}/${stamp}-issue.pdf`, cover_path: `covers/${userId}/${stamp}-issue.jpg` }) }));
    expect(response.status).toBe(500); expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('rejects self-demotion', async () => {
    const response = await changeRole(new NextRequest('https://paper.example/api/team', { method: 'PATCH', body: JSON.stringify({ id: userId, role: 'editor' }) }));
    expect(response.status).toBe(400);
  });
  it('answers 400 for null JSON', async () => {
    const response = await changeRole(new NextRequest('https://paper.example/api/team', { method: 'PATCH', body: 'null' }));
    expect(response.status).toBe(400);
  });
  it.each([null, { id: userId, role: 'editor', aal: 'aal2' }, { id: userId, role: 'admin', aal: 'aal1' }])('denies sensitive team changes for an unauthorized session %j', async user => {
    mocks.user.mockResolvedValue(user);
    const response = await inviteMember(new NextRequest('https://paper.example/api/team', { method: 'POST', body: JSON.stringify({ email: 'editor@example.test' }) }));
    expect(response.status).toBe(user ? 403 : 401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('deactivates upload owners without deleting Auth, files or attribution', async () => {
    const target = '22222222-2222-4222-8222-222222222222';
    const update = vi.fn(() => ({ eq: () => ({ select: async () => ({ data: [{ id: target }], error: null }) }) }));
    const hardDelete = vi.fn();
    mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: target, active: true }, error: null }) }) }), update, delete: hardDelete }) });
    const response = await deactivateMember(new NextRequest(`https://paper.example/api/team?id=${target}`, { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ active: false });
    expect(hardDelete).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('closes the account of a deactivated member and lifts the ban when they return', async () => {
    const target = '22222222-2222-4222-8222-222222222222';
    const update = vi.fn(() => ({ eq: () => ({ select: async () => ({ data: [{ id: target }], error: null }) }) }));
    mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: target, active: true }, error: null }) }) }), update }) });
    await deactivateMember(new NextRequest(`https://paper.example/api/team?id=${target}`, { method: 'DELETE' }));
    expect(mocks.ban).toHaveBeenCalledWith(target, { ban_duration: '876000h' });

    mocks.ban.mockClear();
    mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: target, active: false }, error: null }) }) }), update }) });
    const restored = await changeRole(new NextRequest('https://paper.example/api/team', { method: 'PATCH', body: JSON.stringify({ id: target, active: true }) }));
    expect(restored.status).toBe(200);
    expect(mocks.ban).toHaveBeenCalledWith(target, { ban_duration: 'none' });
  });
  it('does not mutate a target outside the editorial team', async () => {
    const update = vi.fn();
    mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), update }) });
    const response = await deactivateMember(new NextRequest('https://paper.example/api/team?id=22222222-2222-4222-8222-222222222222', { method: 'DELETE' }));
    expect(response.status).toBe(404); expect(update).not.toHaveBeenCalled();
  });
  it('reports account service failures as retryable instead of rejecting the session', async () => {
    mocks.user.mockRejectedValue(new Error('Network outage'));
    expect((await changeRole(new NextRequest('https://paper.example/api/team', { method: 'PATCH', body: '{}' }))).status).toBe(503);
  });
  it('denies AI requests even in demo mode without a member', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await requireAiAccess('analyze'))?.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses the shared database quota', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await requireAiAccess('detect'))?.status).toBe(429);
    expect(mocks.rpc).toHaveBeenCalledWith('consume_ai_quota', { quota_scope: 'detect' });
  });
  it('edits content while preserving the existing slug and author', async () => {
    const update = vi.fn(() => ({ eq: () => ({ select: async () => ({ data: [{ id: 'article-1' }], error: null }) }) }));
    mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { author_id: userId, image_url: null, image_path: null }, error: null }) }) }), update }) });
    const response = await editArticle(new NextRequest('https://paper.example/api/articles', { method: 'PATCH', body: JSON.stringify({ id: 'article-1', title: 'Corrected title', body: 'Corrected text', published: true }) }));
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ title: 'Corrected title', body: 'Corrected text' });
    expect(update.mock.calls[0][0]).not.toHaveProperty('slug');
    expect(update.mock.calls[0][0]).not.toHaveProperty('author_id');
  });
  it('deletes an issue only with two-factor verification', async () => {
    const remove = vi.fn(() => ({ eq: () => ({ select: async () => ({ data: [{ id: 'edition-1', pdf_path: null, cover_path: null }], error: null }) }) }));
    mocks.client.mockResolvedValue({ from: () => ({ delete: remove }) });
    mocks.user.mockResolvedValue({ id: userId, role: 'admin', aal: 'aal1' });
    const denied = await removeEdition(new NextRequest('https://paper.example/api/editions?id=edition-1', { method: 'DELETE' }));
    expect(denied.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();

    mocks.user.mockResolvedValue({ id: userId, role: 'admin', aal: 'aal2' });
    const allowed = await removeEdition(new NextRequest('https://paper.example/api/editions?id=edition-1', { method: 'DELETE' }));
    expect(allowed.status).toBe(200);
    expect(remove).toHaveBeenCalled();
  });
  it('deletes another member’s article only with two-factor verification', async () => {
    const remove = vi.fn(() => ({ eq: () => ({ select: async () => ({ data: null, error: null }) }) }));
    mocks.client.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'article-1', author_id: '22222222-2222-4222-8222-222222222222', image_path: null, image_url: null }, error: null }) }) }), delete: remove }) });
    mocks.user.mockResolvedValue({ id: userId, role: 'admin', aal: 'aal1' });
    const denied = await removeArticle(new NextRequest('https://paper.example/api/articles?id=article-1', { method: 'DELETE' }));
    expect(denied.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();

    mocks.user.mockResolvedValue({ id: userId, role: 'admin', aal: 'aal2' });
    const allowed = await removeArticle(new NextRequest('https://paper.example/api/articles?id=article-1', { method: 'DELETE' }));
    expect(allowed.status).toBe(200);
  });
});
