import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reader: typeof import('../src/lib/reader-preload');
const value = (id: string, ready = true) => ({ id, pdfUrl: `/api/media/${id}.pdf`, version: 'v1-file', status: ready ? 'ready' : 'preparing', numPages: 3,
  pages: [1, 2, 3].map(n => ({ n, url: `/page/${id}/${n}`, text: `Page ${n}`, width: 600, height: 800, bytes: 100 })) });
beforeEach(async () => { vi.resetModules(); reader = await import('../src/lib/reader-preload'); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('site-entry magazine preload', () => {
  it('prepares all page images before the viewer is mounted and shares its cache with the viewer', async () => {
    const fetcher = vi.fn(async (url: string) => url.startsWith('/api/') ? Response.json(value('edition')) : new Response('image'));
    vi.stubGlobal('fetch', fetcher);
    await reader.preloadMagazine();
    expect(reader.getReaderPreview('edition').value?.pages).toHaveLength(3);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/reader/latest', '/page/edition/1', '/page/edition/2', '/page/edition/3']);
    await reader.preloadMagazine('edition', '/api/media/edition.pdf');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('deduplicates a reader opened while the site-entry preload is still downloading images', async () => {
    let finish: () => void = () => {};
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api/')) return Response.json(value('edition'));
      await gate; return new Response('image');
    });
    vi.stubGlobal('fetch', fetcher);
    const warmup = reader.preloadMagazine();
    await vi.waitFor(() => expect(reader.getReaderPreview('edition').value?.status).toBe('ready'));
    const viewer = reader.preloadMagazine('edition', '/api/media/edition.pdf');
    finish(); await Promise.all([warmup, viewer]);
    expect(fetcher.mock.calls.filter(call => call[0].startsWith('/api/'))).toHaveLength(1);
  });
  it('fetches a new revision when an edition PDF is replaced', async () => {
    const fetcher = vi.fn(async (url: string) => url.startsWith('/api/') ? Response.json(value('edition')) : new Response('image'));
    vi.stubGlobal('fetch', fetcher);
    await reader.preloadMagazine('edition');
    await reader.preloadMagazine('edition', '/api/media/new-version.pdf');
    expect(fetcher.mock.calls.filter(call => call[0].startsWith('/api/'))).toHaveLength(2);
  });
  it('surfaces a failed preparation so the existing PDF reader remains available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await reader.preloadMagazine('edition');
    expect(reader.getReaderPreview('edition').error).toBe(true);
  });
});
