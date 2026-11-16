import { NextRequest, NextResponse } from 'next/server';
import { requireAiAccess } from '@/lib/ai-access';
import { generateGeminiJson, GeminiError, GEMINI_FALLBACK_MODEL } from '@/lib/gemini';
import { clipAtBoundary, normalizeDescription } from '@/lib/edition-description';

export const runtime = 'nodejs';

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
      description: normalizeDescription(value.description),
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
 * Focused second attempt used only when the first answer has no usable
 * description. It is bounded to one model and to the time left in the form's
 * 45 s budget, so a repair can never turn a fast answer into a timeout.
 */
async function requestDescription({
  apiKey,
  source,
  titleHint,
  startedAt,
}: {
  apiKey: string;
  source: string;
  titleHint: string;
  startedAt: number;
}): Promise<string | null> {
  const remaining = 40_000 - (Date.now() - startedAt);
  if (remaining < 9_000) return null;

  const prompt = [
    'Summarize a high-school newspaper issue from its first pages.',
    titleHint ? `The issue headline may be "${titleHint}".` : '',
    'Write one complete, neutral English sentence about the main stories, at most 22 words.',
    'Paraphrase the text and end with a period. Do not quote the text.',
    'Return only a JSON object with one key: description.',
    'If the text is too limited, return {"description": null}.',
    '',
    clipAtBoundary(source, 3601),
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const text = await generateGeminiJson({
      apiKey,
      parts: [{ text: prompt }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 120,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
      // One model only: this is a repair call, not the main request.
      models: [GEMINI_FALLBACK_MODEL],
      timeoutMs: Math.min(10_000, remaining - 4_000),
    });
    const parsed = JSON.parse(text) as { description?: unknown } | null;
    return normalizeDescription(parsed?.description);
  } catch (error) {
    console.warn(
      '[analyze-edition] Description retry failed: %s',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * POST { text, title? } → issue metadata inferred from PDF text.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const denied = await requireAiAccess('analyze');
  if (denied) return denied;

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
  const titleHint = typeof title === 'string' ? title.trim().slice(0, 160) : '';
  if (source.length < 20) {
    return NextResponse.json({ error: 'Not enough text to describe.' }, { status: 400 });
  }

  const prompt = [
    'Extract metadata for a high-school newspaper issue from its first pages.',
    titleHint ? `A local text detector suggested this possible title: "${titleHint}".` : '',
    'Return only a JSON object with keys: title, description, editionDate, schoolYear, number.',
    'Use null for any field not clearly supported by the text; never guess.',
    'title: the issue headline, not the newspaper masthead.',
    'description: write one complete, neutral English sentence, at most 22 words, about the main stories in the issue. Paraphrase the text, end with a period, and use null if you cannot write a complete summary.',
    'editionDate: publication date in YYYY-MM-DD format; if only month and year are shown, use day 01.',
    'schoolYear: school year in YYYY-YY format, starting in August.',
    'number: positive integer only when the issue number is explicitly identified.',
    '',
    clipAtBoundary(source, 3601),
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const responseText = await generateGeminiJson({
      apiKey,
      parts: [{ text: prompt }],
      generationConfig: {
        temperature: 0.2,
        // Room for a full sentence plus the JSON envelope if the model ignores
        // the 22-word request.
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const metadata = parseMetadata(responseText);
    if (!metadata) {
      return NextResponse.json({ error: 'Gemini returned invalid metadata.' }, { status: 502 });
    }
    if (!metadata.description) {
      metadata.description = await requestDescription({ apiKey, source, titleHint, startedAt });
    }
    if (!metadata.description) {
      console.warn(
        '[analyze-edition] Gemini returned no usable description. Raw metadata: %s',
        responseText.slice(0, 800)
      );
    }
    return NextResponse.json(metadata);
  } catch (error) {
    if (error instanceof GeminiError) {
      // The provider message stays in the server log: it names models and
      // quota details that the visitor does not need.
      console.error('[analyze-edition] Gemini error', error.status, error.message);
      return NextResponse.json(
        { error: 'The issue could not be analyzed with AI right now. You can still fill the details in by hand.' },
        { status: error.status >= 500 ? 502 : error.status },
      );
    }
    return NextResponse.json({ error: 'Could not reach Gemini.' }, { status: 502 });
  }
}
