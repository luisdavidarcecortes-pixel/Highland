/**
 * Shared Gemini model identifiers and the single call path used by the
 * server-side AI routes.
 *
 * Model choice matters: `gemini-3.8-flash` was answering 503 "high demand"
 * during a demand spike, so every upload waited for metadata and then failed.
 * The constants are overridable from the environment so a model can be swapped
 * without a deploy, and the fallback must never be the same string as the
 * primary (that made the old retry a no-op).
 */
export const GEMINI_PRIMARY_MODEL =
  process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
export const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-2.5-flash';
export const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';

/** Per-attempt ceiling. Two attempts stay under the 45 s the UI tolerates. */
const configuredTimeout = Number(process.env.GEMINI_TIMEOUT_MS ?? 20_000);
const DEFAULT_TIMEOUT_MS =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 20_000;

export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  thinkingConfig?: { thinkingBudget: number };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; status?: string };
}

/** A failure that already carries the HTTP status the route should return. */
export class GeminiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * Calls Gemini with the primary model and, if it fails for any reason
 * (overload, timeout, bad response), retries once with a different model.
 * Short follow-up calls can pass `models` to limit the retry chain.
 * Returns the raw JSON text the model produced.
 */
export async function generateGeminiJson({
  apiKey,
  parts,
  generationConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  models,
}: {
  apiKey: string;
  parts: Array<Record<string, unknown>>;
  generationConfig: GeminiGenerationConfig;
  timeoutMs?: number;
  /**
   * Optional model list for short follow-up calls. Defaults to the primary
   * model plus its fallback; duplicates are removed.
   */
  models?: readonly string[];
}): Promise<string> {
  const modelList = Array.from(
    new Set(models?.length ? models : [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL])
  );
  let lastMessage = 'Could not reach Gemini.';
  let lastStatus = 502;

  for (const model of modelList) {
    try {
      const response = await fetch(GEMINI_URL.replace('{model}', model), {
        method: 'POST',
        // Header instead of ?key=: URLs end up in proxy access logs and error
        // reports, and the key must not travel there.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ contents: [{ parts }], generationConfig }),
      });

      const json = (await response.json().catch(() => null)) as GeminiResponse | null;
      if (!response.ok) {
        lastMessage =
          json?.error?.message ?? `Gemini error ${response.status} (${model}).`;
        // A timeout is the only case that should surface as 504; a busy model
        // is a gateway problem, not a slow client.
        lastStatus = 502;
        console.warn('[gemini] %s failed: %s %s', model, response.status, lastMessage);
        continue;
      }

      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        lastMessage = 'Gemini returned an empty response.';
        lastStatus = 502;
        console.warn('[gemini] %s returned no text', model);
        continue;
      }
      return text;
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      lastMessage = timedOut
        ? 'Gemini took too long to answer. Try again in a moment.'
        : 'Could not reach Gemini.';
      lastStatus = timedOut ? 504 : 502;
      console.warn('[gemini] %s threw: %s', model, lastMessage);
    }
  }

  throw new GeminiError(lastMessage, lastStatus);
}
