import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { streamReaderPdf } from '../src/lib/pdf-stream';
import { GET } from '../src/app/api/media/[...path]/route';

const storage = vi.hoisted(() => ({ sign: vi.fn(), member: vi.fn() }));
vi.mock('../src/lib/supabase-server', () => ({
  getSupabaseAnonClient: () => ({ storage: { from: () => ({ createSignedUrl: storage.sign }) } }),
  getSupabaseServerClient: storage.member,
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('reader PDF byte streaming', () => {
  it('preserves range bytes and headers without redirecting or forwarding cookies', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([5, 6, 7]), { status: 206,
      headers: { 'Content-Type': 'application/pdf', 'Content-Length': '3', 'Content-Range': 'bytes 5-7/1000', 'Accept-Ranges': 'bytes' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await streamReaderPdf(new Request('http://local/pdf', { headers: { Range: 'bytes=5-7', Cookie: 'private-session', Authorization: 'secret', 'If-Range': 'etag' } }), 'https://storage.example/authorized.pdf');
    expect(result.status).toBe(206);
    expect(result.headers.get('Content-Range')).toBe('bytes 5-7/1000');
    expect(result.headers.get('Accept-Ranges')).toBe('bytes');
    expect(result.headers.get('Cache-Control')).toContain('private');
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([5, 6, 7]);
    const options = fetcher.mock.calls[0][1];
    expect(options.headers.get('Range')).toBe('bytes=5-7');
    expect(options.headers.get('If-Range')).toBe('etag');
    expect(options.headers.has('Cookie')).toBe(false);
    expect(options.headers.has('Authorization')).toBe(false);
    expect(options.cache).toBe('no-store');
  });
  it('keeps the full response streamed rather than eagerly reading its body', async () => {
    let delivered = false;
    const body = new ReadableStream({ pull(controller) { if (!delivered) { controller.enqueue(new Uint8Array([1])); delivered = true; } else controller.close(); } });
    const upstream = new Response(body, { headers: { 'Accept-Ranges': 'bytes', 'Content-Length': '1', 'Content-Type': 'application/pdf' } });
    vi.stubGlobal('fetch', vi.fn(async () => upstream));
    const result = await streamReaderPdf(new Request('http://local/pdf'), 'https://storage.example/authorized.pdf');
    expect(upstream.bodyUsed).toBe(false);
    expect(await result.arrayBuffer()).toEqual(new Uint8Array([1]).buffer);
  });
  it('rejects malformed ranges and keeps unsatisfiable ranges useful to PDF.js', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 416, headers: { 'Content-Range': 'bytes */1000' } }));
    vi.stubGlobal('fetch', fetcher);
    expect((await streamReaderPdf(new Request('http://local/pdf', { headers: { Range: 'bytes=1-2,5-8' } }), 'https://storage.example/pdf')).status).toBe(416);
    expect(fetcher).not.toHaveBeenCalled();
    const response = await streamReaderPdf(new Request('http://local/pdf', { headers: { Range: 'bytes=1001-' } }), 'https://storage.example/pdf');
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */1000');
  });
  it('never fetches bytes if Storage RLS denies the issue', async () => {
    storage.sign.mockResolvedValue({ error: new Error('denied'), data: null }); storage.member.mockResolvedValue(null);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await GET(new NextRequest('http://local/api/media/editions/id/file.pdf?reader=1'), { params: Promise.resolve({ path: ['editions', 'id', 'file.pdf'] }) });
    expect(result.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('only proxies reader PDFs and leaves image and download redirects intact', async () => {
    storage.sign.mockResolvedValue({ error: null, data: { signedUrl: 'https://storage.example/authorized.pdf' } });
    const fetcher = vi.fn(async () => new Response('pdf', { headers: { 'Accept-Ranges': 'bytes' } })); vi.stubGlobal('fetch', fetcher);
    const context = { params: Promise.resolve({ path: ['editions', 'id', 'file.pdf'] }) };
    expect((await GET(new NextRequest('http://local/api/media/editions/id/file.pdf'), context)).status).toBe(307);
    expect((await GET(new NextRequest('http://local/api/media/covers/id/file.jpg?reader=1'), { params: Promise.resolve({ path: ['covers', 'id', 'file.jpg'] }) })).status).toBe(307);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await GET(new NextRequest('http://local/api/media/editions/id/file.pdf?reader=1'), context)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
