import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDataRangeTransport } from 'pdfjs-dist';
import { createPdfRangeTransport } from '../src/lib/pdf-range';

class Transport {
  onDataRange = vi.fn();
  constructor(public length: number, public initialData: Uint8Array, public progressiveDone: boolean) {}
}
const Base = Transport as unknown as typeof PDFDataRangeTransport;
afterEach(() => { vi.unstubAllGlobals(); });
const part = (begin: number, end: number, total = 10) => new Response(Uint8Array.from({ length: end - begin + 1 }, (_, i) => begin + i), { status: 206, headers: { 'Content-Range': `bytes ${begin}-${end}/${total}` } });
function opts() { return { signal: new AbortController().signal, onProgress: vi.fn(), onError: vi.fn(), chunkSize: 3 }; }

describe('PDF ranges on streaming hosts', () => {
  it('opens from a partial response without Content-Length and requests only the needed bytes', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(part(0, 2)).mockResolvedValueOnce(part(5, 7)); vi.stubGlobal('fetch', fetcher);
    const options = opts(); const range = await createPdfRangeTransport(Base, '/api/media/issue?reader=1', options);
    expect(range.length).toBe(10); expect([...range.initialData!]).toEqual([0, 1, 2]);
    expect(fetcher.mock.calls[0][1].headers.Range).toBe('bytes=0-2');
    range.requestDataRange(5, 8);
    await vi.waitFor(() => expect(range.onDataRange).toHaveBeenCalledWith(5, new Uint8Array([5, 6, 7])));
    expect(fetcher.mock.calls[1][1].headers.Range).toBe('bytes=5-7');
    expect(options.onProgress).toHaveBeenLastCalledWith({ loaded: 6, total: 10 });
  });
  it('does not count overlapping ranges twice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(part(0, 2)).mockResolvedValueOnce(part(2, 5)));
    const options = opts(); const range = await createPdfRangeTransport(Base, '/pdf', options);
    range.requestDataRange(2, 6);
    await vi.waitFor(() => expect(options.onProgress).toHaveBeenLastCalledWith({ loaded: 6, total: 10 }));
  });
  it('fails visibly when the server returns the wrong bytes rather than leaving PDF.js waiting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(part(0, 2)).mockResolvedValueOnce(part(6, 8)));
    const options = opts(); const range = await createPdfRangeTransport(Base, '/pdf', options);
    range.requestDataRange(5, 8);
    await vi.waitFor(() => expect(options.onError).toHaveBeenCalledOnce());
    expect(range.onDataRange).not.toHaveBeenCalled();
  });
  it('cancels outstanding byte requests when the reader closes', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(part(0, 2)).mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    vi.stubGlobal('fetch', fetcher);
    const options = opts(); const range = await createPdfRangeTransport(Base, '/pdf', options);
    range.requestDataRange(5, 8); range.abort();
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
    await Promise.resolve(); expect(options.onError).not.toHaveBeenCalled();
  });
  it('uses an initial full response once if the server does not support ranges', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]))); vi.stubGlobal('fetch', fetcher);
    const range = await createPdfRangeTransport(Base, '/pdf', opts());
    expect(range.length).toBe(4); expect([...range.initialData!]).toEqual([1, 2, 3, 4]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
