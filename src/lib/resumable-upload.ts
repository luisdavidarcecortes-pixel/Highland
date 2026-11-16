import type { DetailedError } from 'tus-js-client';
import { UploadHttpStack } from './upload-http-stack';

export const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;

export function resumableEndpoint(projectUrl: string) {
  const url = new URL(projectUrl);
  if (/^[a-z0-9]+\.supabase\.co$/i.test(url.hostname)) {
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co');
  }
  url.pathname = '/storage/v1/upload/resumable';
  url.search = ''; url.hash = '';
  return url.toString();
}

export interface ResumableOptions {
  projectUrl: string;
  anonKey: string;
  path: string;
  contentType: string;
  token: (refresh: boolean) => Promise<string>;
  onProgress?: (fraction: number) => void;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}

/** Supabase's TUS transport: acknowledged chunks survive failed requests. */
export async function uploadResumable(file: Blob, options: ResumableOptions): Promise<void> {
  const tus = await import('tus-js-client');
  const endpoint = resumableEndpoint(options.projectUrl);
  const allowedOrigins = new Set([new URL(endpoint).origin, new URL(options.projectUrl).origin]);
  let refreshToken = false;
  if (options.signal?.aborted) throw new DOMException('The upload was paused.', 'AbortError');

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', pause);
      if (error) reject(error); else resolve();
    };
    const upload = new tus.Upload(file, {
      endpoint,
      chunkSize: UPLOAD_CHUNK_BYTES,
      parallelUploads: 1,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      httpStack: new UploadHttpStack(new tus.DefaultHttpStack({})),
      headers: { apikey: options.anonKey, 'x-upsert': 'false' },
      metadata: { bucketName: 'newspaper', objectName: options.path, contentType: options.contentType, cacheControl: '3600' },
      // Bind resume data to the exact project, owner-scoped object and bytes.
      fingerprint: async () => ['newspaper-v1', endpoint, options.path, file.size, options.contentType].join('|'),
      onBeforeRequest: async request => {
        const target = new URL(request.getURL());
        if (!allowedOrigins.has(target.origin) || !target.pathname.startsWith('/storage/v1/upload/resumable')) {
          throw new Error('Invalid resumable upload destination.');
        }
        const forceRefresh = refreshToken; refreshToken = false;
        const token = await options.token(forceRefresh);
        if (options.signal?.aborted) throw new DOMException('The upload was paused.', 'AbortError');
        request.setHeader('Authorization', `Bearer ${token}`);
      },
      onShouldRetry: (error, attempt) => {
        const status = error.originalResponse?.getStatus() ?? 0;
        const retry = status === 0 || status === 408 || status === 409 || status === 423 || status === 429 || status >= 500 || (status === 401 && attempt < 2);
        if (status === 401) refreshToken = true;
        if (retry) options.onStatus?.('Connection interrupted. Retrying from the last saved block…');
        return retry;
      },
      onProgress: (sent, total) => { if (!settled && total) options.onProgress?.(sent / total); },
      onChunkComplete: (_chunk, accepted, total) => { if (!settled && total) options.onProgress?.(accepted / total); },
      onSuccess: () => { if (!settled) { options.onProgress?.(1); finish(); } },
      onError: error => {
        const status = (error as DetailedError).originalResponse?.getStatus() ?? 0;
        if (status === 401 || status === 403) finish(new Error('Your upload access could not be verified. Sign in again, then resume.'));
        else if (status === 413) finish(new Error('This PDF exceeds the Storage file-size limit.'));
        else finish(new Error('The connection could not finish the upload. Keep this page open and press Resume upload to continue.'));
      },
    });
    function pause() {
      finish(new DOMException('The upload was paused.', 'AbortError'));
      void upload.abort(false).catch(() => {});
    }
    options.signal?.addEventListener('abort', pause, { once: true });
    // Storage may be unavailable (private browsing / full localStorage). The
    // upload can still run and automatically resume interrupted requests.
    void upload.findPreviousUploads().catch(() => []).then(previous => {
      if (settled) return;
      const resumable = previous.find(item => {
        try { return Boolean(item.uploadUrl) && allowedOrigins.has(new URL(item.uploadUrl!).origin); }
        catch { return false; }
      });
      if (resumable) {
        upload.resumeFromPreviousUpload(resumable);
        options.onStatus?.('Resuming the PDF from the last saved block…');
      }
      upload.start();
    }).catch(() => finish(new Error('Could not prepare the upload. Please retry.')));
  });
}
