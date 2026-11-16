// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { analyzePdf } from '../src/lib/analyze-pdf';

const mock = vi.hoisted(() => ({ coverPage: vi.fn(), destroy: vi.fn(async () => {}) }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({
    numPages: 3,
    getMetadata: async () => ({ info: {} }),
    destroy: mock.destroy,
    getPage: async (number: number) => ({
      getViewport: () => ({ width: 300, height: 400 }),
      getTextContent: async () => ({ items: [] }),
      render: () => { mock.coverPage(number); return { promise: Promise.resolve() }; },
    }),
  }) }),
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture() {
  const source = await PDFDocument.create();
  for (const width of [300, 400, 500]) source.addPage([width, 600]);
  const bytes = await source.save();
  const file = new File([bytes], 'october.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
  return file;
}

it('writes the complete selected order to the PDF and renders its first page as the cover without OCR', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['cover'])));

  const result = await analyzePdf(await fixture(), undefined, [3, 1, 2]);
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(result.file);
  });
  expect((await PDFDocument.load(bytes)).getPages().map(page => page.getWidth())).toEqual([500, 300, 400]);
  expect(result.pageCount).toBe(3);
  expect(mock.coverPage).toHaveBeenCalledWith(3);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects a manual order that would duplicate or lose a page', async () => {
  await expect(analyzePdf(await fixture(), undefined, [3, 1, 1])).rejects.toThrow('each PDF page exactly once');
});
