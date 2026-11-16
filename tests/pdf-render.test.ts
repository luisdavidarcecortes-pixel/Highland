import { expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPdfPage } from '../src/components/flipbook/pdf-render';

it('cancels a stalled page request when the reader navigates away', async () => {
  const controller = new AbortController();
  const doc = { getPage: vi.fn(() => new Promise(() => {})) } as unknown as PDFDocumentProxy;
  const pending = renderPdfPage(doc, 1, { scale: 1, signal: controller.signal });
  controller.abort();
  expect(await pending).toBeNull();
});

it('allows a large page more than thirty seconds while keeping navigation cancellation immediate', async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  try {
    const controller = new AbortController();
    const doc = { getPage: vi.fn(() => new Promise(() => {})) } as unknown as PDFDocumentProxy;
    let settled = false;
    const pending = renderPdfPage(doc, 1, { scale: 1, signal: controller.signal }).then(result => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(45000);
    expect(settled).toBe(false);
    controller.abort();
    expect(await pending).toBeNull();
  } finally { timeout.mockRestore(); vi.useRealTimers(); }
});
