import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { getEditionById } from '@/lib/data-editions';
import { readerFolder, readerVersion, readStoredPage } from '@/lib/prepared-reader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; page: string }> }) {
  const { id, page } = await params;
  if (!/^[1-9]\d{0,4}$/.test(page)) return new Response('Invalid page', { status: 400 });
  try {
    // Re-check publication before every image: generated files are never public assets.
    const edition = await getEditionById(id);
    if (!edition?.published || request.nextUrl.searchParams.get('v') !== readerVersion(edition)) return new Response('Page unavailable', { status: 404 });
    const version = readerVersion(edition);
    const etag = `"${version}-${page}"`;
    const headers = { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=60', 'ETag': etag, 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' };
    // The visitor already has this page: no need to read it again.
    if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
    let image: Uint8Array | null = null;
    try {
      image = new Uint8Array(await readFile(path.join(readerFolder(edition), `${page}.webp`)));
    } catch {
      // Another instance prepared this issue: the page comes from Storage.
      image = await readStoredPage(version, Number(page));
    }
    if (!image) return new Response('Page unavailable', { status: 404 });
    const body = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer;
    return new Response(body, { headers });
  } catch { return new Response('Page unavailable', { status: 404 }); }
}
