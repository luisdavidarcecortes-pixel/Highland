import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/demo';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';

async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  return { user };
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const form = await req.formData();
  const pdfEntry = form.get('pdf');
  const coverEntry = form.get('cover');
  const pdf = pdfEntry instanceof File && pdfEntry.size > 0 ? pdfEntry : null;
  const cover = coverEntry instanceof File && coverEntry.size > 0 ? coverEntry : null;
  const title = String(form.get('title') ?? '').trim();
  const number = Number(form.get('number') ?? 0);
  const editionDate = String(form.get('edition_date') ?? '');
  const schoolYear = String(form.get('school_year') ?? '');
  const description = String(form.get('description') ?? '').trim();

  if (!pdf || !cover || !title || !editionDate) {
    return NextResponse.json({ error: 'A PDF, its first-page cover, and title are required.' }, { status: 400 });
  }
  if (pdf.type !== 'application/pdf' || cover.type !== 'image/jpeg') {
    return NextResponse.json({ error: 'Upload a PDF with its generated JPEG cover.' }, { status: 400 });
  }

  const stamp = Date.now();
  const pdfPath = `editions/${stamp}-${slugify(title)}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('newspaper')
    .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const coverPath = `covers/${stamp}-${slugify(title)}.jpg`;
  const { error: covErr } = await supabase.storage
    .from('newspaper')
    .upload(coverPath, cover, { contentType: 'image/jpeg', upsert: false });
  if (covErr) {
    const { error: cleanupErr } = await supabase.storage.from('newspaper').remove([pdfPath]);
    if (cleanupErr) {
      return NextResponse.json({
        error: `${covErr.message}. The uploaded PDF could not be removed: ${cleanupErr.message}`,
      }, { status: 500 });
    }
    return NextResponse.json({ error: covErr.message }, { status: 500 });
  }

  const { data: pdfUrlData } = supabase.storage.from('newspaper').getPublicUrl(pdfPath);
  const pdfPublicUrl = pdfUrlData.publicUrl;
  const coverPublicUrl = supabase.storage.from('newspaper').getPublicUrl(coverPath).data.publicUrl;

  const { data, error: dbErr } = await supabase
    .from('editions')
    .insert({
      number: number || null,
      title,
      description: description || null,
      edition_date: editionDate,
      school_year: schoolYear,
      pdf_path: pdfPath,
      pdf_url: pdfPublicUrl,
      cover_path: coverPath,
      cover_url: coverPublicUrl,
      published: false,
    })
    .select()
    .single();

  if (dbErr) {
    const { error: cleanupErr } = await supabase.storage.from('newspaper').remove([pdfPath, coverPath]);
    if (cleanupErr) {
      return NextResponse.json({
        error: `${dbErr.message}. Uploaded files could not be removed: ${cleanupErr.message}`,
      }, { status: 500 });
    }
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }
  return NextResponse.json({ edition: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error || !user) return error!;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  if (req.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await req.formData();
    const id = String(form.get('id') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    const editionDate = String(form.get('edition_date') ?? '').trim();
    const schoolYear = String(form.get('school_year') ?? '').trim();
    const numberValue = Number(form.get('number') ?? 0);
    const description = String(form.get('description') ?? '').trim();
    const pdfEntry = form.get('pdf');
    const coverEntry = form.get('cover');
    const pdf = pdfEntry instanceof File && pdfEntry.size > 0 ? pdfEntry : null;
    const cover = coverEntry instanceof File && coverEntry.size > 0 ? coverEntry : null;

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

    const stamp = Date.now();
    const uploadedPaths: string[] = [];
    let pdfPath: string | null = null;
    let coverPath: string | null = null;

    if (pdf) {
      if (pdf.type !== 'application/pdf') {
        return NextResponse.json({ error: 'The replacement file must be a PDF.' }, { status: 400 });
      }
      if (!cover || cover.type !== 'image/jpeg') {
        return NextResponse.json({
          error: 'The replacement PDF must include its generated first-page cover.',
        }, { status: 400 });
      }
      pdfPath = `editions/${stamp}-${slugify(title)}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from('newspaper')
        .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false });
      if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });
      uploadedPaths.push(pdfPath);
    }

    if (cover) {
      if (!pdf || cover.type !== 'image/jpeg') {
        if (uploadedPaths.length) {
          const { error: cleanupErr } = await supabase.storage
            .from('newspaper')
            .remove(uploadedPaths);
          if (cleanupErr) {
            return NextResponse.json({
              error: `The replacement cover must be an image. Uploaded temporary files could not be removed: ${cleanupErr.message}`,
            }, { status: 500 });
          }
        }
        return NextResponse.json({
          error: 'A generated JPEG cover can only be uploaded with its replacement PDF.',
        }, { status: 400 });
      }
      coverPath = `covers/${stamp}-${slugify(title)}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('newspaper')
        .upload(coverPath, cover, { contentType: cover.type, upsert: false });
      if (uploadErr) {
        if (uploadedPaths.length) {
          const { error: cleanupErr } = await supabase.storage
            .from('newspaper')
            .remove(uploadedPaths);
          if (cleanupErr) {
            return NextResponse.json({
              error: `${uploadErr.message}. Temporary files could not be removed: ${cleanupErr.message}`,
            }, { status: 500 });
          }
        }
        return NextResponse.json({ error: uploadErr.message }, { status: 500 });
      }
      uploadedPaths.push(coverPath);
    }

    const updates: Record<string, unknown> = {
      number: numberValue || null,
      title,
      description: description || null,
      edition_date: editionDate,
      school_year: schoolYear,
    };
    if (pdfPath) {
      updates.pdf_path = pdfPath;
      updates.pdf_url = supabase.storage.from('newspaper').getPublicUrl(pdfPath).data.publicUrl;
    }
    if (coverPath) {
      updates.cover_path = coverPath;
      updates.cover_url = supabase.storage.from('newspaper').getPublicUrl(coverPath).data.publicUrl;
    }

    const { error: updateErr } = await supabase.from('editions').update(updates).eq('id', id);
    if (updateErr) {
      if (uploadedPaths.length) {
        const { error: cleanupErr } = await supabase.storage
          .from('newspaper')
          .remove(uploadedPaths);
        if (cleanupErr) {
          return NextResponse.json({
            error: `${updateErr.message}. Temporary files could not be removed: ${cleanupErr.message}`,
          }, { status: 500 });
        }
      }
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const oldPaths = [
      pdfPath ? existing.pdf_path : null,
      coverPath ? existing.cover_path : null,
    ].filter((path): path is string => Boolean(path));
    if (oldPaths.length) {
      const { error: cleanupErr } = await supabase.storage.from('newspaper').remove(oldPaths);
      if (cleanupErr) {
        return NextResponse.json({
          ok: true,
          warning: `Issue saved, but an old file could not be removed: ${cleanupErr.message}`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  }

  const body = await req.json();
  const { id, published } = body as { id?: string; published?: boolean };
  if (!id || typeof published !== 'boolean') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const { error: dbErr } = await supabase
    .from('editions')
    .update({ published })
    .eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
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
      await supabase.storage.from('newspaper').remove(paths);
    }
  }

  const { error: dbErr } = await supabase.from('editions').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Avoids unused-import warning in demo mode
void isDemoMode;
