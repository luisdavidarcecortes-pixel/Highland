/**
 * Minimal in-memory rate limiter for the AI routes.
 *
 * Those endpoints spend the server's Gemini quota on behalf of whoever calls
 * them, and in demo mode there is no session to check, so a public deployment
 * is an open proxy without this. Serverless instances each keep their own map
 * (a shared store would be better); this still stops a single client from
 * looping the endpoint.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Keeping the map bounded: a flood of unique keys must not leak memory.
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client identity behind a proxy (Vercel sets x-forwarded-for). */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}
