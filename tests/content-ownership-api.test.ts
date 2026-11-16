import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Ownership rules for articles and issues (findings S1 and S2).
 *
 * Only the author (articles) / the uploader (issues) and an administrator may
 * change a row. The publication flag is an edit like any other: an editor must
 * not publish or unpublish a colleague's work.
 */

const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), cleanup: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/auth', () => ({ getSessionUser: mocks.user, SessionAccessError: class extends Error {} }));
vi.mock('../src/lib/supabase-server', () => ({
  getSupabaseServerClient: mocks.client,
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock('../src/lib/storage-cleanup', () => ({ cleanupObjects: mocks.cleanup }));
import { PATCH as patchArticle } from '../src/app/api/articles/route';
import { PATCH as patchEdition } from '../src/app/api/editions/route';

const editorId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown> & { id: string };

/** Minimal double of the Supabase query builder used by the two handlers. */
function fakeClient(rows: { articles?: Row; editions?: Row }) {
  const updates: { table: string; updates: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            const row = table === 'articles' ? rows.articles : rows.editions;
            return { data: row && row.id === id ? row : null, error: null };
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push({ table, updates: payload });
        return { eq: () => ({ select: async () => ({ data: [{ id: 'row' }], error: null }) }) };
      },
    }),
  };
  return { client, updates };
}

function asEditor() {
  mocks.user.mockResolvedValue({ id: editorId, role: 'editor', aal: 'aal1', email: 'editor@example.test', fullName: 'Editor' });
}
function asAdmin() {
  mocks.user.mockResolvedValue({ id: editorId, role: 'admin', aal: 'aal2', email: 'admin@example.test', fullName: 'Admin' });
}

function articleRequest(body: Record<string, unknown>) {
  return new NextRequest('https://paper.example/api/articles', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function editionRequest(body: Record<string, unknown>) {
  return new NextRequest('https://paper.example/api/editions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: editorId, role: 'editor', aal: 'aal1', email: 'editor@example.test', fullName: 'Editor' });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe('articles: only the author or an admin may change an article', () => {
  it('refuses to publish another author’s article', async () => {
    const { client, updates } = fakeClient({ articles: { id: 'article-1', author_id: otherId, image_url: null, image_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchArticle(articleRequest({ id: 'article-1', published: true }));
    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('refuses to unpublish another author’s article', async () => {
    const { client, updates } = fakeClient({ articles: { id: 'article-1', author_id: otherId, image_url: null, image_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchArticle(articleRequest({ id: 'article-1', published: false }));
    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('refuses to rewrite another author’s article', async () => {
    const { client, updates } = fakeClient({ articles: { id: 'article-1', author_id: otherId, image_url: null, image_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchArticle(articleRequest({ id: 'article-1', title: 'Hijacked', body: 'Hijacked body' }));
    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('lets an editor publish and edit their own article', async () => {
    const { client, updates } = fakeClient({ articles: { id: 'article-1', author_id: editorId, image_url: null, image_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchArticle(articleRequest({ id: 'article-1', published: true, title: 'My story', body: 'My text' }));
    expect(response.status).toBe(200);
    expect(updates[0].updates).toMatchObject({ published: true, title: 'My story', body: 'My text' });
  });

  it('lets an admin publish and rewrite another author’s article', async () => {
    asAdmin();
    const { client, updates } = fakeClient({ articles: { id: 'article-1', author_id: otherId, image_url: null, image_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchArticle(articleRequest({ id: 'article-1', published: true, title: 'Corrected', body: 'Corrected text' }));
    expect(response.status).toBe(200);
    expect(updates[0].updates).toMatchObject({ published: true, title: 'Corrected' });
  });
});

describe('issues: only the uploader or an admin may change an issue', () => {
  it('refuses to publish another member’s issue', async () => {
    const { client, updates } = fakeClient({ editions: { id: 'edition-1', created_by: otherId, pdf_path: null, cover_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchEdition(editionRequest({ id: 'edition-1', published: true }));
    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('refuses to unpublish another member’s issue', async () => {
    const { client, updates } = fakeClient({ editions: { id: 'edition-1', created_by: otherId, pdf_path: null, cover_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchEdition(editionRequest({ id: 'edition-1', published: false }));
    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('refuses to rewrite another member’s issue metadata', async () => {
    const { client, updates } = fakeClient({ editions: { id: 'edition-1', created_by: otherId, pdf_path: null, cover_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchEdition(editionRequest({
      id: 'edition-1',
      title: 'Hijacked title',
      number: 9,
      edition_date: '2026-11-03',
      school_year: '2026-27',
    }));
    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it('lets an editor publish and edit their own issue', async () => {
    const { client, updates } = fakeClient({ editions: { id: 'edition-1', created_by: editorId, pdf_path: null, cover_path: null } });
    mocks.client.mockResolvedValue(client);
    const published = await patchEdition(editionRequest({ id: 'edition-1', published: true }));
    expect(published.status).toBe(200);
    expect(updates[0].updates).toMatchObject({ published: true });

    const edited = await patchEdition(editionRequest({
      id: 'edition-1',
      title: 'My issue',
      number: 4,
      edition_date: '2026-11-03',
      school_year: '2026-27',
    }));
    expect(edited.status).toBe(200);
    expect(updates[1].updates).toMatchObject({ title: 'My issue' });
  });

  it('lets an admin publish and rewrite another member’s issue', async () => {
    asAdmin();
    const { client, updates } = fakeClient({ editions: { id: 'edition-1', created_by: otherId, pdf_path: null, cover_path: null } });
    mocks.client.mockResolvedValue(client);
    const response = await patchEdition(editionRequest({ id: 'edition-1', published: true }));
    expect(response.status).toBe(200);
    expect(updates[0].updates).toMatchObject({ published: true });

    const rewritten = await patchEdition(editionRequest({
      id: 'edition-1',
      title: 'Corrected issue',
      number: 9,
      edition_date: '2026-11-03',
      school_year: '2026-27',
    }));
    expect(rewritten.status).toBe(200);
    expect(updates[1].updates).toMatchObject({ title: 'Corrected issue' });
  });

  it('answers 404 for an issue that does not exist', async () => {
    const { client, updates } = fakeClient({});
    mocks.client.mockResolvedValue(client);
    const response = await patchEdition(editionRequest({ id: 'missing', published: true }));
    expect(response.status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});
