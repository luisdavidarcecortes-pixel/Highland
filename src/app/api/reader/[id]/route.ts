import { after, NextRequest, NextResponse } from 'next/server';
import { getEditionById, getPublishedEditions } from '@/lib/data-editions';
import { preparedReader, ReaderBusyError } from '@/lib/prepared-reader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The issue is prepared after the response has been sent. Vercel's free plan
// allows five minutes per function, which is plenty for a whole issue; if the
// function is still killed, the pages already rendered stay in Storage and the
// next visit picks them up instead of starting from zero.
export const maxDuration = 300;

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip');
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const edition = id === 'latest' ? (await getPublishedEditions())[0] : await getEditionById(id);
    if (!edition?.published) return NextResponse.json({ error: 'Issue unavailable' }, { status: 404 });
    const { preview, done } = await preparedReader(edition, clientKey(request));
    after(() => done);
    return NextResponse.json(preview, { status: preview.status === 'preparing' ? 202 : 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    // The site-wide queue is full (or this client asked for too many
    // preparations): the visitor is told to retry instead of piling up work.
    if (error instanceof ReaderBusyError) {
      return NextResponse.json(
        { error: 'The reader is busy preparing this issue. Please try again in a few seconds.' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } },
      );
    }
    console.error('[reader] preparation failed', error);
    return NextResponse.json({ error: 'Reader preparation unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } });
  }
}
