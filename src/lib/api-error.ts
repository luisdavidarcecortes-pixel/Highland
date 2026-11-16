import { NextResponse } from 'next/server';

/**
 * Database and provider errors never reach the visitor.
 *
 * A PostgREST error carries table names, constraints and column details, and a
 * provider error carries model names and quota information. Both stay in the
 * server log; the browser only learns that the request failed.
 */
export function serverError(
  scope: string,
  error: unknown,
  message = 'The request could not be completed. Please try again.',
  status = 500
) {
  console.error(`[api:${scope}]`, error);
  return NextResponse.json({ error: message }, { status });
}
