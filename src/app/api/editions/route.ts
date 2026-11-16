import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { apiSession } from '@/lib/api-session';
import { isOwnedUpload, mediaUrl } from '@/lib/media';
import { cleanupObjects } from '@/lib/storage-cleanup';
import { serverError } from '@/lib/api-error';

export const runtime = 'nodejs';

const BUCKET = 'newspaper';

/**
 * Uploads happen in the browser (src/lib/storage-upload.ts): a serverless host
 * cuts any request body at 4.5 MB and an issue is ~44 MB, so the file must
 * never travel through this app — it would be a hard 413 in production while
 * working fine in dev. These handlers only accept the resulting paths and
 * record the row.
 */
const PDF_PATH_RE = /^editions\/[a-f0-9-]+\/(\d+)-[a-z0-9-]{1,120}\.pdf$/;
const COVER_PATH_RE = /^covers\/[a-f0-9-]+\/(\d+)-[a-z0-9-]{1,120}\.jpg$/;
/**
 * Allow the same 24-hour window as resumable Storage uploads. The RPC verifies the actual
 * Storage owner before the API may attach or clean up the uploaded files.
 */
const PATH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PATH_MAX_SKEW_MS = 60 * 1000;

function validPath(path: string, pattern: RegExp): boolean {
  const match = pattern.exec(path);
  if (!match) return false;
  const stamp = Number(match[1]);
  const age = Date.now() - stamp;
  return age >= -PATH_MAX_SKEW_MS && age <= PATH_MAX_AGE_MS;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hasJsonContentType(req: NextRequest): boolean {
  return req.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false;
}

const requireUser = apiSession;

/**
 * Every path must exist in Storage before the row points at it, so a half
 * failed upload cannot produce an issue whose PDF 404s in the reader.
 * Returns the first missing path, or null when all of them are real.
 */
async function firstMissingObject(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>,
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
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  // The shared cleanup verifies that no content still references the object.
  await cleanupObjects(paths);
}

async function ownsUploads(supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, paths: string[], userId: string) {
  if (!isOwnedUpload(paths[0], userId, 'editions') || !isOwnedUpload(paths[1], userId, 'covers')) return false;
  const { data, error } = await supabase.rpc('owns_newspaper_uploads', { object_paths: paths });
  return !error && data === true;
}

/** A retry after a lost response must return the original draft, not duplicate it. */
async function savedAttempt(supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, id: string, userId: string, pdfPath: string, coverPath: string) {
  const { data, error } = await supabase.from('editions').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not verify the previous save. Please retry.' }, { status: 503 });
  if (!data) return null;
  if (data.created_by !== userId || data.pdf_path !== pdfPath || data.cover_path !== coverPath) {
    return NextResponse.json({ error: 'This save identifier belongs to a different upload.' }, { status: 409 });
  }
  return NextResponse.json({ edition: data }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  if (!hasJsonContentType(req)) {
    return NextResponse.json(
      { error: 'This editor page is out of date. Refresh the page, select the PDF again, and retry.' },
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
  } | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim();
  const id = body.id == null ? '' : String(body.id);
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid save identifier.' }, { status: 400 });
  }
  const number = Number(body.number ?? 0);
  const editionDate = String(body.edition_date ?? '');
  const schoolYear = String(body.school_year ?? '');
  const description = String(body.description ?? '').trim();
  const pdfPath = String(body.pdf_path ?? '');
  const coverPath = String(body.cover_path ?? '');

  if (!title || !editionDate || !schoolYear || !Number.isSafeInteger(number) || number < 0) {
    return NextResponse.json({ error: 'A title and a date are required.' }, { status: 400 });
  }
  if (!validDate(editionDate)) {
    return NextResponse.json({ error: 'Invalid edition date.' }, { status: 400 });
  }
  if (!validPath(pdfPath, PDF_PATH_RE) || !validPath(coverPath, COVER_PATH_RE)) {
    return NextResponse.json(
      { error: 'The uploaded PDF or cover is missing. Please select the files again.' },
      { status: 400 },
    );
  }

  if (id) {
    const previous = await savedAttempt(supabase, id, user.id, pdfPath, coverPath);
    if (previous) return previous;
  }

  if (!(await ownsUploads(supabase, [pdfPath, coverPath], user.id))) {
    return NextResponse.json({ error: 'The files must belong to your account. Re-upload them or apply the database migration.' }, { status: 403 });
  }
  const missing = await firstMissingObject(supabase, [pdfPath, coverPath]);
  if (missing) {
    return NextResponse.json(
      { error: 'The upload did not finish. Please select the PDF and its cover again.' },
      { status: 400 },
    );
  }

  const pdfUrl = mediaUrl(pdfPath);
  const coverUrl = mediaUrl(coverPath);

  const { data, error: dbErr } = await supabase
    .from('editions')
    .insert({
      ...(id ? { id } : {}),
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
      created_by: user.id,
    })
    .select()
    .single();

  if (dbErr) {
    if (id && dbErr.code === '23505') {
      const previous = await savedAttempt(supabase, id, user.id, pdfPath, coverPath);
      if (previous) return previous;
    }
    // Retain the completed files so the client can retry this same save.
    return serverError('editions', dbErr);
  }
  return NextResponse.json({ edition: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = await getSupabaseServerClient();
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
    const { data: target, error: findErr } = await supabase
      .from('editions')
      .select('id,created_by')
      .eq('id', id)
      .maybeSingle();
    if (findErr) return serverError('editions', findErr);
    if (!target) return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
    // Only the member who uploaded the issue, or an administrator, may publish it.
    if (user.role !== 'admin' && target.created_by !== user.id) {
      return NextResponse.json({ error: 'Only the uploader or an admin can publish this issue.' }, { status: 403 });
    }
    const { data, error: dbErr } = await supabase
      .from('editions')
      .update({ published: body.published })
      .eq('id', id)
      .select('id');
    if (dbErr) return serverError('editions', dbErr);
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
    }
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
  if (
    !validDate(editionDate)
  ) {
    return NextResponse.json({ error: 'Invalid edition date.' }, { status: 400 });
  }

  const { data: existing, error: findErr } = await supabase
    .from('editions')
    .select('pdf_path, cover_path, created_by')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return serverError('editions', findErr);
  if (!existing) return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
  // The same ownership rule applies to every other change of an issue: only the
  // member who uploaded it, or an administrator, may edit its content.
  if (user.role !== 'admin' && existing.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the uploader or an admin can edit this issue.' }, { status: 403 });
  }

  if (replaceFiles) {
    // Replacing the PDF always brings its cover: the two are generated together
    // in the panel, so one without the other means the upload was cut short.
    if (!validPath(pdfPath, PDF_PATH_RE) || !validPath(coverPath, COVER_PATH_RE)) {
      return NextResponse.json(
        { error: 'The replacement PDF and its cover must both be uploaded.' },
        { status: 400 },
      );
    }
    if (!(await ownsUploads(supabase, [pdfPath, coverPath], user.id))) {
      return NextResponse.json({ error: 'The replacement files must belong to your account.' }, { status: 403 });
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
    updates.pdf_url = mediaUrl(pdfPath);
    updates.cover_path = coverPath;
    updates.cover_url = mediaUrl(coverPath);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('editions')
    .update(updates)
    .eq('id', id)
    .select('id');
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
  }

  const oldPaths = replaceFiles
    ? [existing.pdf_path, existing.cover_path].filter((path): path is string => Boolean(path) && path !== pdfPath && path !== coverPath)
    : [];
  if (oldPaths.length) {
    const cleanupErr = await cleanupObjects(oldPaths);
    if (cleanupErr) {
      return NextResponse.json({
        ok: true,
        warning: cleanupErr,
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
  // Deleting an issue also removes its PDF: it must not be possible with a
  // stolen password alone.
  if (user.aal !== 'aal2') {
    return NextResponse.json(
      { error: 'Deleting an issue requires two-factor verification. Enable it in your account settings.' },
      { status: 403 },
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Delete the row FIRST. Files removed before a failed delete left a
  // published issue whose PDF 404s in the reader (exactly the "The PDF could
  // not be loaded" state supabase-server.ts warns about).
  const { data: deleted, error: dbErr } = await supabase
    .from('editions')
    .delete()
    .eq('id', id)
    .select('pdf_path, cover_path');
  if (dbErr) return serverError('editions', dbErr);
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
  }

  // Best-effort: an orphaned object is far less harmful than a broken issue.
  const paths = deleted
    .flatMap((row) => [row.pdf_path, row.cover_path])
    .filter((path): path is string => Boolean(path));
  await removeObjects(supabase, paths);

  return NextResponse.json({ ok: true });
}
