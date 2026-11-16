// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readerPdfUrl, usePdfDoc } from '../src/lib/use-pdf-doc';

const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: '' }, PDFDataRangeTransport: class {} }));
const rangeMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('pdfjs-dist', () => pdf);
vi.mock('../src/lib/pdf-range', () => ({ createPdfRangeTransport: rangeMock.create }));
let tasks: Array<any>;
let counter = 0;
beforeEach(() => {
  vi.useFakeTimers(); tasks = [];
  rangeMock.create.mockReset().mockResolvedValue({ abort: vi.fn() });
  pdf.getDocument.mockImplementation(() => {
    let resolve: (doc: unknown) => void = () => {};
    let reject: (error: Error) => void = () => {};
    const task = { promise: new Promise((res, rej) => { resolve = res; reject = rej; }), onProgress: (_p: unknown) => {}, resolve,
      destroy: vi.fn(async () => { reject(new Error('Worker destroyed')); }) };
    tasks.push(task); return task;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
async function start() {
  const url = `/test-${counter++}.pdf`;
  const hook = renderHook(({ source }) => usePdfDoc(source), { initialProps: { source: url } });
  await act(async () => {});
  return { ...hook, task: tasks[0] };
}

it('allows a slow PDF to load for longer than two minutes while bytes advance', async () => {
  const { result, task } = await start();
  for (let i = 1; i <= 5; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(40000); task.onProgress({ loaded: i * 100, total: 1000 }); });
  }
  expect(task.destroy).not.toHaveBeenCalled();
  const doc = { destroy: vi.fn(async () => {}) };
  await act(async () => task.resolve(doc));
  expect(result.current.doc).toBe(doc);
  expect(result.current.error).toBeNull();
});
it('detects a genuine stall despite duplicate progress events and preserves the useful error', async () => {
  const { result, task } = await start();
  act(() => task.onProgress({ loaded: 100, total: 1000 }));
  await act(async () => { await vi.advanceTimersByTimeAsync(40000); task.onProgress({ loaded: 100, total: 1000 }); await vi.advanceTimersByTimeAsync(20000); });
  expect(task.destroy).toHaveBeenCalledOnce();
  expect(result.current.error).toContain('stalled');
  expect(result.current.loading).toBe(false);
});
it('cancels the previous download when the reader switches issues', async () => {
  const { rerender, task } = await start();
  await act(async () => rerender({ source: `/test-next-${counter++}.pdf` }));
  expect(task.destroy).toHaveBeenCalledOnce();
});
it('requests protected PDFs through the range-enabled reader route', () => {
  expect(readerPdfUrl('/api/media/editions/id/file.pdf')).toBe('/api/media/editions/id/file.pdf?reader=1');
  expect(readerPdfUrl('/api/media/editions/id/file.pdf?reader=1')).toBe('/api/media/editions/id/file.pdf?reader=1');
  expect(readerPdfUrl('/demo/issue.pdf')).toBe('/demo/issue.pdf');
});
it('keeps a loaded range document alive and offers full-download recovery after a later byte failure', async () => {
  const url = `/api/media/editions/id/issue-${counter++}.pdf`;
  const { result } = renderHook(() => usePdfDoc(url));
  await act(async () => {});
  const options = rangeMock.create.mock.calls[0][2];
  const doc = { destroy: vi.fn(async () => {}) };
  await act(async () => tasks[0].resolve(doc));
  act(() => options.onProgress({ loaded: 500, total: 1000 }));
  await act(async () => vi.advanceTimersByTimeAsync(60001));
  expect(doc.destroy).not.toHaveBeenCalled();
  expect(result.current.doc).toBe(doc);
  await act(async () => options.onError());
  expect(doc.destroy).toHaveBeenCalledOnce();
  expect(result.current.error).toContain('PDF data');
  await act(async () => result.current.retry());
  expect(rangeMock.create).toHaveBeenCalledOnce();
  expect(pdf.getDocument).toHaveBeenLastCalledWith(expect.objectContaining({ url: `${url}?reader=1`, disableRange: true }));
});
