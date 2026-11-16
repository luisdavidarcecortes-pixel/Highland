import type { PDFDataRangeTransport } from 'pdfjs-dist';

/** Explicit ranges also work when a streaming host omits Content-Length. */
export async function createPdfRangeTransport(Transport: typeof PDFDataRangeTransport, url: string, options: {
  signal: AbortSignal; onProgress: (progress: { loaded: number; total: number }) => void;
  onError: () => void; chunkSize?: number;
}) {
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  const chunkSize = options.chunkSize ?? 262144;
  const read = async (begin: number, end: number, total?: number) => {
    const response = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal, cache: 'no-store' });
    if (!response.ok) throw new Error('PDF range unavailable');
    const data = new Uint8Array(await response.arrayBuffer());
    // A server without range support may return the complete file on the
    // initial request. PDF.js can still consume that data without a second GET.
    if (response.status === 200 && begin === 0 && total === undefined) return { data, length: data.length };
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '');
    const length = Number(match?.[3]);
    if (response.status !== 206 || !match || !Number.isSafeInteger(length) || length < 1 ||
      Number(match[1]) !== begin || Number(match[2]) !== Math.min(end, length) - 1 ||
      data.length !== Number(match[2]) - begin + 1 || (total !== undefined && length !== total)) {
      throw new Error('Invalid PDF range response');
    }
    return { data, length };
  };
  const first = await read(0, chunkSize);
  const intervals: Array<[number, number]> = [];
  const report = (begin: number, end: number) => {
    intervals.push([begin, end]); intervals.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < intervals.length;) {
      if (intervals[i][0] <= intervals[i - 1][1]) {
        intervals[i - 1][1] = Math.max(intervals[i - 1][1], intervals[i][1]); intervals.splice(i, 1);
      } else i++;
    }
    options.onProgress({ loaded: intervals.reduce((sum, [start, stop]) => sum + stop - start, 0), total: first.length });
  };
  report(0, first.data.length);
  class ReaderRange extends Transport {
    requestDataRange(begin: number, end: number) {
      void read(begin, end, first.length).then(({ data }) => {
        if (signal.aborted) return;
        this.onDataRange(begin, data);
        report(begin, begin + data.length);
      }).catch(() => {
        if (signal.aborted) return;
        controller.abort(); options.onError();
      });
    }
    abort() { controller.abort(); }
  }
  return new ReaderRange(first.length, first.data, true);
}
