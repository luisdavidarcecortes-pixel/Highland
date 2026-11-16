// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { usePdfPages } from '../src/components/flipbook/use-pdf-pages';
import { renderPdfPage } from '../src/components/flipbook/pdf-render';

vi.mock('../src/components/flipbook/pdf-render', () => ({ renderPdfPage: vi.fn(async (_doc, n: number) => ({ url: `page-${n}`, text: `Text ${n}` })) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(renderPdfPage).mockImplementation(async (_doc, n) => ({ url: `page-${n}`, text: `Text ${n}` })); });
const makeDoc = (badFirst = false) => ({ numPages: 8, getPage: vi.fn(async (n: number) => {
  if (badFirst && n === 1) throw new Error('Bad first page');
  return { getViewport: () => ({ width: 600, height: 800 }) };
}) }) as unknown as PDFDocumentProxy;

describe('progressive PDF pages', () => {
  it('keeps all eight page slots from the first render and restores the full cache', async () => {
    const doc = makeDoc();
    const first = renderHook(() => usePdfPages(doc));
    expect(first.result.current.pages).toHaveLength(8);
    await waitFor(() => expect(first.result.current.completed).toBe(8));
    first.unmount();
    const second = renderHook(() => usePdfPages(doc));
    expect(second.result.current.pages).toHaveLength(8);
    expect(second.result.current.completed).toBe(8);
    expect(second.result.current.texts[7]).toBe('Text 8');
  });
  it('resumes an incomplete cache instead of pretending all pages are complete', async () => {
    const doc = makeDoc(); const first = renderHook(() => usePdfPages(doc));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    first.unmount();
    const second = renderHook(() => usePdfPages(doc));
    await waitFor(() => expect(second.result.current.completed).toBe(8));
    expect(second.result.current.texts[7]).toBe('Text 8');
  });
  it('prioritizes a deep link to page eight', async () => {
    const doc = makeDoc();
    const { result } = renderHook(() => usePdfPages(doc, 8));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(vi.mocked(renderPdfPage).mock.calls[0][1]).toBe(8);
    expect(result.current.pages).toHaveLength(8);
  });
  it('keeps usable dimensions when the first page fails', async () => {
    const doc = makeDoc(true);
    vi.mocked(renderPdfPage).mockImplementation(async (_doc, n) => n === 1 ? null : { url: `page-${n}`, text: `Text ${n}` });
    const { result } = renderHook(() => usePdfPages(doc));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.aspect).toBeGreaterThan(0);
    expect(result.current.failedPages).toContain(1);
  });
  it('retries failed pages using the already downloaded document', async () => {
    const doc = makeDoc();
    vi.mocked(renderPdfPage).mockImplementation(async (_doc, n) => n === 1 ? null : { url: `page-${n}`, text: `Text ${n}` });
    const { result } = renderHook(() => usePdfPages(doc));
    await waitFor(() => expect(result.current.completed).toBe(8));
    expect(result.current.failedPages).toContain(1);
    vi.mocked(renderPdfPage).mockClear();
    vi.mocked(renderPdfPage).mockResolvedValue({ url: 'recovered-page', text: 'Recovered' });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.failedPages).toEqual([]));
    expect(result.current.pages[0]).toBe('recovered-page');
    expect(vi.mocked(renderPdfPage).mock.calls.map(call => call[1])).toEqual([1]);
  });
  it('keeps the book mounted when navigating to a page still being rendered', async () => {
    let release: (value: null) => void = () => {};
    vi.mocked(renderPdfPage).mockImplementation(async (_doc, n) => n === 2 ? new Promise(resolve => { release = resolve; }) : { url: `page-${n}`, text: `Text ${n}` });
    const doc = makeDoc();
    const { result, rerender } = renderHook(({ page }) => usePdfPages(doc, page), { initialProps: { page: 1 } });
    await waitFor(() => expect(result.current.ready).toBe(true));
    rerender({ page: 7 });
    expect(result.current.ready).toBe(true);
    await waitFor(() => expect(result.current.pages[6]).toBe('page-7'));
    release(null);
  });
  it('preserves a readable preview if the sharper render fails', async () => {
    const doc = makeDoc();
    const { result, rerender } = renderHook(({ page }) => usePdfPages(doc, page), { initialProps: { page: 1 } });
    await waitFor(() => expect(result.current.completed).toBe(8));
    vi.mocked(renderPdfPage).mockImplementation(async (_doc, n) => n === 7 ? null : { url: `sharp-${n}`, text: `Text ${n}` });
    rerender({ page: 7 });
    await waitFor(() => expect(result.current.failedPages).toContain(7));
    expect(result.current.pages[6]).toBe('page-7');
  });
});
