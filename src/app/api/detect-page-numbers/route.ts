import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/demo';
import { requireAiAccess } from '@/lib/ai-access';
import { generateGeminiJson, GeminiError } from '@/lib/gemini';

export const runtime = 'nodejs';

const MAX_PAGES_PER_REQUEST = 6;
const MAX_IMAGE_LENGTH = 300_000;

interface FooterImage {
  pdfPage: number;
  image: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFooterImages(value: unknown): FooterImage[] | null {
  if (!isRecord(value) || !Array.isArray(value.pages) || value.pages.length === 0 ||
      value.pages.length > MAX_PAGES_PER_REQUEST) {
    return null;
  }

  const seenPages = new Set<number>();
  const images: FooterImage[] = [];
  for (const item of value.pages) {
    if (!isRecord(item)) return null;
    const image = item.image;
    if (
      !Number.isSafeInteger(item.pdfPage) ||
      Number(item.pdfPage) < 1 ||
      seenPages.has(Number(item.pdfPage)) ||
      typeof image !== 'string' ||
      image.length > MAX_IMAGE_LENGTH
    ) {
      return null;
    }
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match) return null;
    seenPages.add(Number(item.pdfPage));
    images.push({ pdfPage: Number(item.pdfPage), image: match[1] });
  }
  return images;
}

function parsePageNumbers(
  text: string,
  expectedPages: Set<number>
): { pdfPage: number; pageNumber: number | null }[] | null {
  try {
    const parsed: unknown = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
    if (!isRecord(parsed) || !Array.isArray(parsed.pages)) return null;

    const seenPages = new Set<number>();
    const results: { pdfPage: number; pageNumber: number | null }[] = [];
    for (const item of parsed.pages) {
      if (!isRecord(item) || !Number.isSafeInteger(item.pdfPage)) return null;
      const pdfPage = Number(item.pdfPage);
      if (!expectedPages.has(pdfPage) || seenPages.has(pdfPage)) return null;
      seenPages.add(pdfPage);

      const confidence = item.confidence;
      const printedNumber = item.printedPageNumber;
      const confident =
        typeof confidence === 'number' &&
        confidence >= 0.9 &&
        Number.isSafeInteger(printedNumber) &&
        Number(printedNumber) > 0;
      results.push({
        pdfPage,
        pageNumber: confident ? Number(printedNumber) : null,
      });
    }

    return seenPages.size === expectedPages.size ? results : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAiAccess('detect');
  if (denied) return denied;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
  }

  const body: unknown = await req.json().catch(() => null);
  const footerImages = parseFooterImages(body);
  if (!footerImages) {
    return NextResponse.json({ error: 'Invalid page-footer images.' }, { status: 400 });
  }

  const prompt = [
    'Read the printed page number from the bottom margin of each attached newspaper page-footer image.',
    'Each image is labeled with its original physical PDF page number.',
    'Read only a clearly printed page number, not a number mentioned in article text, a date, or a continuation note.',
    'Never infer a number from sequence or surrounding pages. If the number is absent, unclear, or there is more than one plausible page number, return null.',
    'Return only JSON with this shape: {"pages":[{"pdfPage":1,"printedPageNumber":1,"confidence":0.99}]}',
    'Use an integer for printedPageNumber and confidence from 0 to 1. Use null and confidence 0 when unsure.',
  ].join('\n');
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const footer of footerImages) {
    parts.push({ text: `Original PDF page ${footer.pdfPage}:` });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: footer.image } });
  }

  try {
    const text = await generateGeminiJson({
      apiKey,
      parts,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const pageNumbers = parsePageNumbers(
      text,
      new Set(footerImages.map((footer) => footer.pdfPage))
    );
    if (!pageNumbers) {
      return NextResponse.json(
        { error: 'Gemini could not confidently read all scanned page numbers.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ pages: pageNumbers });
  } catch (error) {
    if (error instanceof GeminiError) {
      // The provider message stays in the server log.
      console.error('[detect-page-numbers] Gemini error', error.status, error.message);
      return NextResponse.json(
        { error: 'The scanned page numbers could not be read with AI right now. You can order them by hand.' },
        { status: error.status >= 500 ? 502 : error.status },
      );
    }
    return NextResponse.json(
      { error: 'Could not reach Gemini to read scanned page numbers.' },
      { status: 502 }
    );
  }
}
