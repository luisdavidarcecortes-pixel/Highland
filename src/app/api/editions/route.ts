import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

const BUCKET = 'newspaper';

/**
 * Uploads happen in the browser (src/lib/storage-upload.ts): a serverless host
 * cuts any request body at 4.5 MB and an issue is ~44 MB, so the file must
 * never travel through this app — it would be a hard 413 in production while
 * working fine in dev. These handlers only accept the resulting paths and
 * record the row.
 */
const PDF_PATH_RE = /^editions\/(\d+)-[a-z0-9-]{1,80}\.pdf$/;
const COVER_PATH_RE = /^covers\/(\d+)-[a-z0-9-]{1,80}\.jpg$/;
/**
 * Paths are client-chosen, so the timestamp is checked against the clock:
 * without it a signed-in editor could point a new row at another issue's PDF
 * and then, through a failing insert, have the server delete that issue's
 * files. A fresh stamp means "this upload, made right now".
 */
const PATH_MAX_AGE_MS = 10 * 60 * 1000;
const PATH_MAX_SKEW_MS = 60 * 1000;

function validPath(path: string, pattern: RegExp): boolean {
  const match = pattern.exec(path);
  if (!match) return false;
  const stamp = Number(match[1]);
  const age = Date.now() - stamp;
  return age >= -PATH_MAX_SKEW_MS && age <= PATH_MAX_AGE_MS;
}

function hasJsonContentType(req: NextRequest): boolean {
  return req.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false;
}

async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  return { user };
}

/**
 * Every path must exist in Storage before the row points at it, so a half
 * failed upload cannot produce an issue whose PDF 404s in the reader.
 * Returns the first missing path, or null when all of them are real.
 */
async function firstMissingObject(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  paths: string[],
): Promise<string | null> {
  for (const path of paths) {
    const { error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) return path;
  }
  return null;
}

/** Removes objects best-effort; cleanup must not replace the real error. */
async function removeObjects(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from(BUCKET).remove(paths);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  if (!hasJsonContentType(req)) {
    return NextResponse.json(
      { error: 'This editor page is out of date. Refresh the page, select the PDF again, and retry.' },
      { status: 415 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    number?: unknown;
    edition_date?: unknown;
    school_year?: unknown;
    description?: unknown;
    pdf_path?: unknown;
    cover_path?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim();
  const number = Number(body.number ?? 0);
  const editionDate = String(body.edition_date ?? '');
  const schoolYear = String(body.school_year ?? '');
  const description = String(body.description ?? '').trim();
  const pdfPath = String(body.pdf_path ?? '');
  const coverPath = String(body.cover_path ?? '');

  if (!title || !editionDate) {
    return NextResponse.json({ error: 'A title and a date are required.' }, { status: 400 });
  }
  if (!validPath(pdfPath, PDF_PATH_RE) || !validPath(coverPath, COVER_PATH_RE)) {
    return NextResponse.json(
      { error: 'The uploaded PDF or cover is missing. Please select the files again.' },
      { status: 400 },
    );
  }

  const missing = await firstMissingObject(supabase, [pdfPath, coverPath]);
  if (missing) {
    return NextResponse.json(
      { error: 'The upload did not finish. Please select the PDF and its cover again.' },
      { status: 400 },
    );
  }

  const pdfUrl = supabase.storage.from(BUCKET).getPublicUrl(pdfPath).data.publicUrl;
  const coverUrl = supabase.storage.from(BUCKET).getPublicUrl(coverPath).data.publicUrl;

  const { data, error: dbErr } = await supabase
    .from('editions')
    .insert({
      number: number || null,
      title,
      description: description || null,
      edition_date: editionDate,
      school_year: schoolYear,
      pdf_path: pdfPath,
      pdf_url: pdfUrl,
      cover_path: coverPath,
      cover_url: coverUrl,
      published: false,
    })
    .select()
    .single();

  if (dbErr) {
    await removeObjects(supabase, [pdfPath, coverPath]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }
  return NextResponse.json({ edition: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  if (!hasJsonContentType(req)) {
    return NextResponse.json(
      { error: 'This editor page is out of date. Refresh the page and retry.' },
      { status: 415 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    title?: unknown;
    number?: unknown;
    edition_date?: unknown;
    school_year?: unknown;
    description?: unknown;
    pdf_path?: unknown;
    cover_path?: unknown;
    published?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  // Publish / unpublish (the small payload from the eye button).
  if (typeof body.published === 'boolean') {
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    const { error: dbErr } = await supabase.from('editions').update({ published: body.published }).eq('id', id);
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? '').trim();
  const title = String(body.title ?? '').trim();
  const editionDate = String(body.edition_date ?? '').trim();
  const schoolYear = String(body.school_year ?? '').trim();
  const numberValue = Number(body.number ?? 0);
  const description = String(body.description ?? '').trim();
  const pdfPath = body.pdf_path == null ? '' : String(body.pdf_path);
  const coverPath = body.cover_path == null ? '' : String(body.cover_path);
  const replaceFiles = Boolean(pdfPath || coverPath);

  if (
    !id ||
    !title ||
    !editionDate ||
    !schoolYear ||
    !Number.isInteger(numberValue) ||
    numberValue < 0
  ) {
    return NextResponse.json({ error: 'Invalid issue data.' }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from('editions')
    .select('pdf_path, cover_path')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });

  if (replaceFiles) {
    // Replacing the PDF always brings its cover: the two are generated together
    // in the panel, so one without the other means the upload was cut short.
    if (!validPath(pdfPath, PDF_PATH_RE) || !validPath(coverPath, COVER_PATH_RE)) {
      return NextResponse.json(
        { error: 'The replacement PDF and its cover must both be uploaded.' },
        { status: 400 },
      );
    }
    const missing = await firstMissingObject(supabase, [pdfPath, coverPath]);
    if (missing) {
      return NextResponse.json(
        { error: 'The upload did not finish. Please select the PDF and its cover again.' },
        { status: 400 },
      );
    }
  }

  const updates: Record<string, unknown> = {
    number: numberValue || null,
    title,
    description: description || null,
    edition_date: editionDate,
    school_year: schoolYear,
  };
  if (replaceFiles) {
    updates.pdf_path = pdfPath;
    updates.pdf_url = supabase.storage.from(BUCKET).getPublicUrl(pdfPath).data.publicUrl;
    updates.cover_path = coverPath;
    updates.cover_url = supabase.storage.from(BUCKET).getPublicUrl(coverPath).data.publicUrl;
  }

  const { error: updateErr } = await supabase.from('editions').update(updates).eq('id', id);
  if (updateErr) {
    // The freshly uploaded objects are ours (fresh stamp), so dropping them
    // keeps the 1 GB free quota clean when the row could not be saved.
    if (replaceFiles) await removeObjects(supabase, [pdfPath, coverPath]);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const oldPaths = replaceFiles
    ? [existing.pdf_path, existing.cover_path].filter((path): path is string => Boolean(path))
    : [];
  if (oldPaths.length) {
    const { error: cleanupErr } = await supabase.storage.from(BUCKET).remove(oldPaths);
    if (cleanupErr) {
      return NextResponse.json({
        ok: true,
        warning: `Issue saved, but an old file could not be removed: ${cleanupErr.message}`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can delete issues' }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Delete associated storage files
  const { data: ed } = await supabase
    .from('editions')
    .select('pdf_path, cover_path')
    .eq('id', id)
    .maybeSingle();
  if (ed) {
    const paths = [ed.pdf_path, ed.cover_path].filter(Boolean) as string[];
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths);
    }
  }

  const { error: dbErr } = await supabase.from('editions').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
