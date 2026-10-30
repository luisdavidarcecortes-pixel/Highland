import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/demo';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { GEMINI_URL, GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL } from '@/lib/gemini';

export const runtime = 'nodejs';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

interface EditionMetadata {
  title: string | null;
  description: string | null;
  editionDate: string | null;
  schoolYear: string | null;
  number: number | null;
}

function parseMetadata(text: string): EditionMetadata | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const number =
      typeof value.number === 'number' && Number.isSafeInteger(value.number) && value.number > 0
        ? value.number
        : null;
    const editionDate =
      typeof value.editionDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value.editionDate) &&
      !Number.isNaN(Date.parse(`${value.editionDate}T00:00:00Z`))
        ? value.editionDate
        : null;

    return {
      title: typeof value.title === 'string' ? value.title.trim().slice(0, 160) || null : null,
      description:
        typeof value.description === 'string'
          ? value.description.trim().slice(0, 280) || null
          : null,
      editionDate,
      schoolYear:
        typeof value.schoolYear === 'string' && /^\d{4}-\d{2}$/.test(value.schoolYear)
          ? value.schoolYear
          : null,
      number,
    };
  } catch {
    return null;
  }
}

/**
 * POST { text, title? } → issue metadata inferred from PDF text.
 */
export async function POST(req: NextRequest) {
  // Without Supabase (demo/local mode) there is no session to check; the Gemini
  // key still lives server-side. With Supabase configured, editors must sign in.
  if (!isDemoMode()) {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const limit = rateLimit(`analyze:${clientKey(req)}`, 30, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many analyses from this connection. Try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not set in .env.local' },
      { status: 500 }
    );
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
  const { text, title } = body as { text?: unknown; title?: unknown };
  const source = typeof text === 'string' ? text.trim() : '';
  const titleHint = typeof title === 'string' ? title : '';
  if (source.length < 20) {
    return NextResponse.json({ error: 'Not enough text to describe.' }, { status: 400 });
  }

  const prompt = [
    'Extract metadata for a high-school newspaper issue from its first pages.',
    titleHint ? `A local text detector suggested this possible title: "${titleHint}".` : '',
    'Return only a JSON object with keys: title, description, editionDate, schoolYear, number.',
    'Use null for any field not clearly supported by the text; never guess.',
    'title: the issue headline, not the newspaper masthead.',
    'description: one engaging, neutral English sentence of at most 22 words, without quotes or a final period.',
    'editionDate: publication date in YYYY-MM-DD format; if only month and year are shown, use day 01.',
    'schoolYear: school year in YYYY-YY format, starting in August.',
    'number: positive integer only when the issue number is explicitly identified.',
    '',
    source.slice(0, 6000),
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const callGemini = (model: string) =>
      fetch(`${GEMINI_URL.replace('{model}', model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

    let res = await callGemini(GEMINI_PRIMARY_MODEL);
    if (res.status === 503 || res.status === 429) {
      // Transient demand spikes on the free tier: one retry after a short pause.
      await new Promise((resolve) => setTimeout(resolve, 900));
      res = await callGemini(GEMINI_PRIMARY_MODEL);
    }
    if (res.status === 503 || res.status === 429) {
      res = await callGemini(GEMINI_FALLBACK_MODEL);
    }
    const json = (await res.json()) as GeminiResponse;
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? `Gemini error ${res.status}` },
        { status: 502 }
      );
    }
    const responseText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!responseText) {
      return NextResponse.json({ error: 'Gemini returned no metadata.' }, { status: 502 });
    }
    const metadata = parseMetadata(responseText);
    if (!metadata) {
      return NextResponse.json({ error: 'Gemini returned invalid metadata.' }, { status: 502 });
    }
    return NextResponse.json(metadata);
  } catch {
    return NextResponse.json({ error: 'Could not reach Gemini.' }, { status: 502 });
  }
}
