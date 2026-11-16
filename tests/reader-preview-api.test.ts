import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as manifest } from '../src/app/api/reader/[id]/route';
import { GET as image } from '../src/app/api/reader/[id]/[page]/route';

const mock = vi.hoisted(() => ({ edition: vi.fn(), latest: vi.fn(), prepare: vi.fn(), read: vi.fn(), stored: vi.fn() }));
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: (fn: () => void) => fn() }));
vi.mock('../src/lib/data-editions', () => ({ getEditionById: mock.edition, getPublishedEditions: mock.latest }));
vi.mock('../src/lib/prepared-reader', () => ({ preparedReader: mock.prepare, readerFolder: () => '/cache/reader/version', readerVersion: () => 'v1-version', readStoredPage: mock.stored }));
vi.mock('node:fs/promises', () => ({ readFile: mock.read }));
const edition = { id: 'edition', pdf_url: '/api/media/issue.pdf', published: true };
beforeEach(() => {
  mock.edition.mockResolvedValue(edition); mock.latest.mockResolvedValue([edition]);
  mock.prepare.mockResolvedValue({ preview: { id: 'edition', status: 'preparing', pages: [] }, done: Promise.resolve() });
  mock.read.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mock.stored.mockResolvedValue(null);
});
afterEach(() => vi.clearAllMocks());
describe('prepared magazine privacy and revision checks', () => {
  it('starts preparation of the published latest edition without waiting for conversion', async () => {
    const result = await manifest(new NextRequest('http://local/api/reader/latest'), { params: Promise.resolve({ id: 'latest' }) });
    expect(result.status).toBe(202); expect(mock.prepare).toHaveBeenCalled();
    expect(mock.prepare.mock.calls[0][0]).toBe(edition);
    expect(result.headers.get('Cache-Control')).toContain('no-store');
  });
  it('does not prepare a draft or deleted issue', async () => {
    mock.edition.mockResolvedValue({ ...edition, published: false });
    const result = await manifest(new NextRequest('http://local/api/reader/edition'), { params: Promise.resolve({ id: 'edition' }) });
    expect(result.status).toBe(404); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it('blocks an old revision and non-public images even if cached files exist', async () => {
    const context = { params: Promise.resolve({ id: 'edition', page: '1' }) };
    expect((await image(new NextRequest('http://local/api/reader/edition/1?v=old'), context)).status).toBe(404);
    mock.edition.mockResolvedValue(null);
    expect((await image(new NextRequest('http://local/api/reader/edition/1?v=v1-version'), context)).status).toBe(404);
    expect(mock.read).not.toHaveBeenCalled();
  });
  it('rejects paths masquerading as page numbers', async () => {
    const result = await image(new NextRequest('http://local/page'), { params: Promise.resolve({ id: 'edition', page: '../source.pdf' }) });
    expect(result.status).toBe(400); expect(mock.read).not.toHaveBeenCalled();
  });
  it('serves optimized images privately and supports revalidation', async () => {
    const context = { params: Promise.resolve({ id: 'edition', page: '1' }) };
    const result = await image(new NextRequest('http://local/page?v=v1-version'), context);
    expect(result.status).toBe(200); expect(result.headers.get('Content-Type')).toBe('image/webp');
    expect(result.headers.get('Cache-Control')).toContain('private');
    const cached = await image(new NextRequest('http://local/page?v=v1-version', { headers: { 'If-None-Match': result.headers.get('ETag')! } }), context);
    expect(cached.status).toBe(304);
  });
});
