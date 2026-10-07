'use client';

import { getSupabaseBrowserClient } from './supabase-browser';

const BUCKET = 'newspaper';

function storageConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * The panel's session lives in cookies (the SSR browser client), so RLS can
 * check who is uploading. Without a session this falls back to the anon key
 * and Storage answers 401 — a clear "sign in again" instead of a silent fail.
 */
async function accessToken(anonKey: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return anonKey;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? anonKey;
  } catch {
    return anonKey;
  }
}

function uploadError(xhr: XMLHttpRequest): Error {
  const fallback = `Storage rejected the upload (HTTP ${xhr.status}).`;
  try {
    const payload = JSON.parse(xhr.responseText) as { message?: string; error?: string; error_description?: string };
    const message = payload.message ?? payload.error ?? payload.error_description;
    if (message) return new Error(message);
  } catch {
    /* Non-JSON error body: fall through to the status. */
  }
  return new Error(fallback);
}

/**
 * Uploads one object straight from the browser to Supabase Storage.
 *
 * Why not through `/api/editions`: a serverless host cuts any request body at
 * 4.5 MB (Vercel documents it as a hard 413) and a single issue of this
 * newspaper is ~44 MB, so every upload would fail in production while working
 * perfectly in dev. The browser talks to Storage directly — the same RLS
 * policies as before, since the endpoint used to forward the editor's session
 * anyway — and the route handler afterwards only records the row.
 *
 * The body is the raw file with an explicit `Content-Type`, which is what
 * storage-js sends for a non-Blob body: it is how the object ends up stored
 * with the right MIME type instead of `application/octet-stream`.
 *
 * XHR rather than fetch for the upload progress bar: a 44 MB file on a school
 * connection is minutes of nothing otherwise.
 */
export async function uploadObject(
  path: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const config = storageConfig();
  if (!config) {
    throw new Error('Supabase is not configured: files cannot be uploaded in demo mode.');
  }
  const { url, anonKey } = config;
  const token = await accessToken(anonKey);
  // Storage routes on /object/<bucket>/<path>: without the bucket segment the
  // first path part is read as the bucket name and Storage answers
  // "Bucket not found".
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const objectUrl = `${url}/storage/v1/object/${BUCKET}/${encodedPath}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', objectUrl);
    xhr.responseType = 'text';
    // Large PDFs over a slow connection: five minutes per file is generous
    // enough to finish and short enough that a stalled upload always recovers.
    xhr.timeout = 5 * 60 * 1000;
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(uploadError(xhr));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and try again.'));
    xhr.ontimeout = () => reject(new Error('The upload took too long and was cancelled. Try again, or use a smaller PDF.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));
    xhr.send(file);
  });
}

/**
 * Best-effort removal of an object the client just uploaded but can no longer
 * save (the follow-up row insert never happened). The 1 GB free quota makes an
 * orphaned 44 MB PDF expensive, but a failed cleanup must never mask the
 * original error, so this never throws.
 */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch {
    /* Nothing sensible to do: the object will be cleaned up by hand later. */
  }
}
