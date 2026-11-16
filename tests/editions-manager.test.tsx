// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditionsManager } from '../src/app/admin/editions/editions-manager';

const mock = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), refresh: vi.fn(), analyze: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock('../src/lib/demo', () => ({ isDemoMode: () => false }));
vi.mock('../src/lib/storage-upload', () => ({ uploadObject: mock.upload, removeObjects: mock.remove }));
vi.mock('../src/lib/analyze-pdf', () => ({ analyzePdf: mock.analyze }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 3 }), destroy: async () => {} }) }));
vi.mock('../src/components/flipbook/pdf-render', () => ({ renderPdfPage: async () => null }));
vi.mock('../src/lib/supabase-browser', () => ({ getSupabaseBrowserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) } }) }));

const pdf = new File(['pdf'], 'issue.pdf', { type: 'application/pdf' });
Object.defineProperty(pdf, 'size', { value: 42 * 1024 * 1024 });
const cover = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
beforeEach(() => {
  vi.clearAllMocks(); mock.upload.mockReset(); mock.remove.mockResolvedValue(undefined);
  mock.analyze.mockResolvedValue({ file: pdf, cover, pageCount: 12, pageOrderChanged: false, title: 'My issue', editionDate: '2026-08-31', schoolYear: '2026-27', text: '' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function prepare() {
  render(<EditionsManager initialEditions={[]} demo={false} admin />);
  fireEvent.change(screen.getByLabelText(/Newspaper PDF/), { target: { files: [pdf] } });
  await screen.findByText(/The cover is ready/);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My issue' } });
  return screen.getByRole('button', { name: 'Upload issue', exact: true });
}
const response = (status: number) => new Response(JSON.stringify(status === 200 ? { ok: true } : { error: 'Database unavailable' }), { status, headers: { 'Content-Type': 'application/json' } });

describe('issue upload form recovery', () => {
  it('keeps a rejected PDF selected, then uploads only the confirmed manual revision', async () => {
    const preparedPdf = new File(['reordered'], 'issue.pdf', { type: 'application/pdf' });
    Object.defineProperty(pdf, 'arrayBuffer', { configurable: true, value: async () => new ArrayBuffer(0) });
    mock.analyze.mockRejectedValueOnce(new Error('Multiple possible page numbers'));
    mock.analyze.mockResolvedValue({ file: preparedPdf, cover, pageCount: 3, pageOrderChanged: true, title: 'October issue', text: 'October features student projects and fall events.' });
    const fetcher = vi.fn(async (url: string) => url === '/api/analyze-edition'
      ? Response.json({ description: 'Explore student projects and fall events in the October issue.' })
      : response(200));
    vi.stubGlobal('fetch', fetcher);
    mock.upload.mockResolvedValue(undefined);
    render(<EditionsManager initialEditions={[]} demo={false} admin />);
    const input = screen.getByLabelText(/Newspaper PDF/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf] } });
    await screen.findByText(/Multiple possible page numbers/);
    expect(input.files?.[0]).toBe(pdf);
    fireEvent.change(screen.getByLabelText('Page order'), { target: { value: 'manual' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Use PDF page 3 as cover' }));
    const upload = screen.getByRole('button', { name: 'Upload issue' }) as HTMLButtonElement;
    expect(upload.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm page order' }));
    await screen.findByText(/Order confirmed for 3 pages/);
    expect(mock.analyze).toHaveBeenLastCalledWith(pdf, expect.any(Function), [3, 1, 2]);
    await screen.findByDisplayValue('Explore student projects and fall events in the October issue.');
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'My description.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move PDF page 2 earlier' }));
    expect(upload.disabled).toBe(true);
    fireEvent.submit(upload.closest('form')!);
    expect(mock.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm page order' }));
    await screen.findByText(/Order confirmed for 3 pages/);
    expect(mock.analyze).toHaveBeenLastCalledWith(pdf, expect.any(Function), [3, 2, 1]);
    fireEvent.submit(upload.closest('form')!);
    await screen.findByText(/Issue created!/);
    expect(mock.upload.mock.calls.map(call => call[1])).toEqual([preparedPdf, cover]);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/analyze-edition', '/api/editions']);
  });

  it('pauses and resumes the same PDF without cancelling a newly created attempt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(200)));
    mock.upload.mockImplementationOnce((_path, _file, _type, progress, options) => {
      expect(options.signal.aborted).toBe(false);
      progress(0.5);
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('paused', 'AbortError'))));
    }).mockImplementation(async (_path, _file, _type, progress) => { progress(1); });
    fireEvent.submit((await prepare()).closest('form')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause upload', exact: true }));
    const resume = await screen.findByRole('button', { name: 'Resume upload', exact: true });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
    fireEvent.submit(resume.closest('form')!);
    await screen.findByText('Issue created! You can publish it whenever you like.');
    expect(mock.upload.mock.calls[0][0]).toBe(mock.upload.mock.calls[1][0]);
    expect(mock.upload.mock.calls[1][4]).toMatchObject({ resume: true });
    expect(mock.refresh).toHaveBeenCalledOnce();
  });
  it('retries a failed database save using the same draft identifier and completed files', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(500)).mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetcher);
    mock.upload.mockImplementation(async (_path, _file, _type, progress) => { progress(1); });
    fireEvent.submit((await prepare()).closest('form')!);
    fireEvent.submit((await screen.findByRole('button', { name: 'Retry save', exact: true })).closest('form')!);
    await screen.findByText('Issue created! You can publish it whenever you like.');
    expect(mock.upload).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetcher.mock.calls[0][1].body); const second = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(first.id).toBe(second.id); expect(first.pdf_path).toBe(second.pdf_path);
    expect(mock.remove).not.toHaveBeenCalled();
  });
});
