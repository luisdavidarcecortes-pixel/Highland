'use client';

export async function requestJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(45000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Request failed (HTTP ${response.status}).`);
  if (!body) throw new Error('The server returned an invalid response.');
  return body as T;
}
