/** A shared deadline prevents auth and database outages from hanging a page. */
export function boundedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout((init?.method ?? 'GET').toUpperCase() === 'GET' ? 5000 : 15000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal, cache: 'no-store' });
}
