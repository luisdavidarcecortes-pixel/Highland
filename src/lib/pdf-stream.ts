/** Keeps PDF range headers readable on our origin, after Storage RLS authorizes the file. */
export async function streamReaderPdf(request: Request, signedUrl: string) {
  const headers = new Headers({ 'Accept-Encoding': 'identity' });
  const range = request.headers.get('Range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return new Response('Invalid byte range', { status: 416 });
  if (range) headers.set('Range', range);
  const ifRange = request.headers.get('If-Range');
  if (range && ifRange) headers.set('If-Range', ifRange);

  const headerTimeout = new AbortController();
  const timer = setTimeout(() => headerTimeout.abort(), 15000);
  try {
    const upstream = await fetch(signedUrl, {
      headers, cache: 'no-store', signal: AbortSignal.any([request.signal, headerTimeout.signal]),
    });
    clearTimeout(timer);
    const responseHeaders = new Headers({
      'Cache-Control': 'private, max-age=60, no-transform',
      'Referrer-Policy': 'no-referrer', 'Vary': 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (upstream.status === 416) {
      await upstream.body?.cancel();
      responseHeaders.delete('Content-Length');
      return new Response('Range unavailable', { status: 416, headers: responseHeaders });
    }
    if (!upstream.ok || (upstream.headers.get('Content-Encoding') && upstream.headers.get('Content-Encoding') !== 'identity')) {
      await upstream.body?.cancel();
      return new Response('PDF unavailable', { status: upstream.status === 404 ? 404 : 502 });
    }
    // Do not buffer a 42 MB issue in server memory. Cancellation and backpressure
    // propagate through the stream, including PDF.js cancelling its initial GET.
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response('PDF temporarily unavailable', { status: 503 });
  } finally { clearTimeout(timer); }
}
