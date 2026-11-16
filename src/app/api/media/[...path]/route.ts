import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAnonClient, getSupabaseServerClient } from '@/lib/supabase-server';
import { streamReaderPdf } from '@/lib/pdf-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const path = parts.join('/');
  if (!/^(editions|covers|articles)\/[a-zA-Z0-9/_ .-]+$/.test(path) || parts.some(p => p === '.' || p === '..')) {
    return new NextResponse('Invalid file path', { status: 400 });
  }
  const anon = getSupabaseAnonClient();
  if (!anon) return new NextResponse('Storage unavailable', { status: 503 });
  // Storage RLS, rather than a public bucket URL, decides which records are visible.
  let result = await anon.storage.from('newspaper').createSignedUrl(path, 3600);
  if (result.error) {
    const member = await getSupabaseServerClient();
    if (member) result = await member.storage.from('newspaper').createSignedUrl(path, 3600);
  }
  if (result.error || !result.data?.signedUrl) return new NextResponse('File unavailable', { status: 404 });
  // A redirect to Storage hides Accept-Ranges from browser JavaScript because
  // Storage does not expose that CORS header. The reader would download the
  // whole issue before opening it. Stream only the reader's PDFs on our origin.
  if (req.nextUrl.searchParams.get('reader') === '1' && path.startsWith('editions/') && /\.pdf$/i.test(path)) {
    return streamReaderPdf(req, result.data.signedUrl);
  }
  const response = NextResponse.redirect(result.data.signedUrl, 307);
  // The signed URL is a bearer token for a private file: it must never be
  // cached by a shared proxy, and the answer depends on the visitor's session.
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
