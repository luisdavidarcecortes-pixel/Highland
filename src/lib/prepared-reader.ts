import 'server-only';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Edition } from './types';
import type { PreparedPage, ReaderPreview } from './reader-preview';
import { mediaPath } from './media';
import { getSupabaseAnonClient, getSupabaseAdminClient } from './supabase-server';

interface DiskManifest { status: ReaderPreview['status']; numPages: number; pages: Omit<PreparedPage, 'url'>[] }
type Job = { done: Promise<void>; started: number; failed: boolean };
const state = globalThis as typeof globalThis & { newspaperReaderJobs?: Map<string, Job>; newspaperReaderQueue?: Promise<void> };
const jobs = state.newspaperReaderJobs ??= new Map();

// The cache lives in the system temporary directory: on a serverless host the
// deployment folder is read-only, and /tmp is writable (and disposable, which
// is fine: the real copy is kept in Supabase Storage).
const root = path.join(tmpdir(), 'highlander-reader');

const BUCKET = 'newspaper';
const PREPARED_PREFIX = 'prepared';
/** How many issues may be rendered at the same time in the whole site. */
const MAX_RUNNING = 4;
/** A client may not start more than this many preparations per minute. */
const MAX_STARTS_PER_MINUTE = 3;
/** How often the finished pages are copied to Storage while the job runs. */
const UPLOAD_EVERY_MS = 2000;

export function readerVersion(edition: Pick<Edition, 'pdf_url'>) {
  return 'v1-' + createHash('sha256').update(edition.pdf_url).digest('hex').slice(0, 24);
}
export function readerFolder(edition: Pick<Edition, 'pdf_url'>) { return path.join(root, readerVersion(edition)); }
async function readManifest(folder: string): Promise<DiskManifest | null> {
  try { return JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8')); } catch { return null; }
}

/* -------------------------------------------------------------------------- */
/* Shared state: the queue lives in the database, not in this instance        */
/* -------------------------------------------------------------------------- */

type Claim = 'claimed' | 'held' | 'busy' | 'ready';

async function claimJob(editionId: string, version: string): Promise<Claim> {
  const admin = getSupabaseAdminClient();
  if (!admin) return 'claimed'; // demo mode: no shared registry
  try {
    const { data, error } = await admin.rpc('claim_reader_job', {
      p_edition: editionId,
      p_version: version,
      p_max_running: MAX_RUNNING,
    });
    if (error) {
      // The queue is a guard, not a requirement: if the database is
      // unreachable the instance keeps its own local limit.
      console.error('[reader] could not claim the global slot', error.message);
      return 'claimed';
    }
    return (data as Claim) ?? 'claimed';
  } catch (error) {
    console.error('[reader] could not claim the global slot', error);
    return 'claimed';
  }
}

async function finishJob(editionId: string, status: 'ready' | 'failed', pages = 0, error?: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  try {
    await admin.rpc('finish_reader_job', {
      p_edition: editionId,
      p_status: status,
      p_pages: pages,
      p_error: error ?? null,
    });
  } catch (failure) {
    console.error('[reader] could not release the global slot', failure);
  }
}

/* -------------------------------------------------------------------------- */
/* The prepared pages live in Storage, so no instance renders the same PDF twice */
/* -------------------------------------------------------------------------- */

function storagePath(version: string, file: string) {
  return `${PREPARED_PREFIX}/${version}/${file}`;
}

async function uploadFile(version: string, folder: string, file: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const body = await readFile(path.join(folder, file));
  const objectPath = storagePath(version, file);
  const asHeader = file.endsWith('.webp') ? 'image/webp' : 'application/json';
  let { error } = await admin.storage.from(BUCKET).upload(objectPath, body, { contentType: asHeader, upsert: true });
  if (error && /mime/i.test(error.message)) {
    // A bucket created before migration 20261111000400 only accepts the
    // editorial MIME types. The manifest is a plain JSON file kept in a private
    // bucket, so declaring it as PDF keeps that older setup working.
    ({ error } = await admin.storage.from(BUCKET).upload(objectPath, body, { contentType: 'application/pdf', upsert: true }));
  }
  if (error) throw new Error(error.message);
}

async function readStoredManifest(version: string): Promise<DiskManifest | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.storage.from(BUCKET).download(storagePath(version, 'manifest.json'));
    if (error || !data) return null;
    return JSON.parse(await data.text()) as DiskManifest;
  } catch {
    return null;
  }
}

export async function readStoredPage(version: string, page: number): Promise<Uint8Array | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.storage.from(BUCKET).download(storagePath(version, `${page}.webp`));
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Per client quota: a visitor cannot queue preparations without limit       */
/* -------------------------------------------------------------------------- */

const starts = new Map<string, number[]>();
function tooManyStarts(clientKey: string | null | undefined): boolean {
  if (!clientKey) return false;
  const now = Date.now();
  const recent = (starts.get(clientKey) ?? []).filter(time => now - time < 60000);
  if (recent.length >= MAX_STARTS_PER_MINUTE) {
    starts.set(clientKey, recent);
    return true;
  }
  recent.push(now);
  starts.set(clientKey, recent);
  if (starts.size > 5000) {
    for (const [key, times] of starts) {
      if (!times.some(time => now - time < 60000)) starts.delete(key);
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */

async function pdfSource(edition: Edition): Promise<string> {
  const objectPath = mediaPath(edition.pdf_url);
  if (objectPath) {
    const storage = getSupabaseAnonClient();
    const result = await storage?.storage.from(BUCKET).createSignedUrl(objectPath, 600);
    if (!result?.data?.signedUrl || result.error) throw new Error('PDF unavailable');
    return result.data.signedUrl;
  }
  if (edition.pdf_url.startsWith('/demo/') && !edition.pdf_url.includes('..')) {
    return path.join(process.cwd(), 'public', edition.pdf_url);
  }
  throw new Error('Unsupported PDF source');
}

async function generate(edition: Edition) {
  const folder = readerFolder(edition);
  await mkdir(folder, { recursive: true });
  const source = await pdfSource(edition);
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('PDF unavailable');
    await writeFile(path.join(folder, 'source.pdf'), new Uint8Array(await response.arrayBuffer()));
  } else {
    await writeFile(path.join(folder, 'source.pdf'), new Uint8Array(await readFile(source)));
  }
  try { await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'prepare-reader.mjs'), 'batch', folder], {
      cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    // The last lines of the worker are the only clue when it dies inside a
    // serverless function, where there is no terminal to watch.
    let diagnosis = '';
    child.stderr?.on('data', chunk => { diagnosis = (diagnosis + String(chunk)).slice(-2000); });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('PDF preparation timed out')); }, 210000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`PDF preparation failed (${code}): ${diagnosis.trim().split('\n').slice(-2).join(' ')}`));
    });
  }); } finally { await unlink(path.join(folder, 'source.pdf')).catch(() => {}); }
}

/**
 * Copies the pages to Storage while they are being produced, so a serverless
 * function that is killed half way does not throw the work away: the next
 * attempt (or another instance) finds the pages already there.
 */
async function publishWhileRunning(version: string, folder: string, stop: () => boolean) {
  const uploaded = new Set<string>();
  const publishNewFiles = async () => {
    let files: string[] = [];
    try { files = await readdir(folder); } catch { files = []; }
    for (const file of files) {
      if (!/^(manifest\.json|\d+\.webp)$/.test(file) || uploaded.has(file)) continue;
      try {
        await uploadFile(version, folder, file);
        uploaded.add(file);
      } catch (error) {
        console.error('[reader] could not publish a prepared page', error);
      }
    }
  };
  while (!stop()) {
    await publishNewFiles();
    await new Promise(resolve => setTimeout(resolve, UPLOAD_EVERY_MS));
  }
  // The last round: the pages written just before the job ended.
  await publishNewFiles();
  return uploaded;
}

export class ReaderBusyError extends Error {
  constructor() { super('Reader preparation busy'); this.name = 'ReaderBusyError'; }
}

/**
 * One job per PDF revision. The pages are kept in Storage, so an instance
 * that did not render the issue serves the same result without repeating the
 * expensive work, and the database keeps a single queue for the whole site.
 */
export async function preparedReader(
  edition: Edition,
  clientKey?: string | null
): Promise<{ preview: ReaderPreview; done: Promise<void> }> {
  const version = readerVersion(edition);
  let disk = await readManifest(readerFolder(edition));
  let job = jobs.get(version);

  if (disk?.status !== 'ready') {
    // Another instance may have prepared this issue already.
    const stored = disk ? null : await readStoredManifest(version);
    if (stored?.status === 'ready') disk = stored;

    if (disk?.status !== 'ready' && (!job || (job.failed && Date.now() - job.started > 30000))) {
      if (tooManyStarts(clientKey)) throw new ReaderBusyError();

      const claim = await claimJob(edition.id, version);
      if (claim === 'busy') throw new ReaderBusyError();
      if (claim === 'held') {
        // Someone else is rendering this very issue: the visitor waits and the
        // pages are served from Storage once they are ready.
        return { done: Promise.resolve(), preview: {
          id: edition.id, pdfUrl: edition.pdf_url, version,
          status: 'preparing', numPages: 0, pages: [],
        } };
      }

      job = { started: Date.now(), failed: false, done: Promise.resolve() };
      const current = job;
      // Converting different issues is serialized to bound CPU and memory use.
      current.done = (state.newspaperReaderQueue ?? Promise.resolve()).then(async () => {
        let stop = false;
        // The pages travel to Storage while they are produced.
        const publisher = publishWhileRunning(version, readerFolder(edition), () => stop);
        try {
          await generate(edition);
        } finally {
          stop = true;
          await publisher;
        }
        const manifest = await readManifest(readerFolder(edition));
        if (manifest) {
          await uploadFile(version, readerFolder(edition), 'manifest.json').catch(error =>
            console.error('[reader] could not publish the manifest', error));
        }
        await finishJob(edition.id, 'ready', manifest?.numPages ?? 0);
      }).catch(async (error: unknown) => {
        current.failed = true;
        await mkdir(readerFolder(edition), { recursive: true }).then(() =>
          writeFile(path.join(readerFolder(edition), 'manifest.json'), JSON.stringify({ status: 'failed', numPages: 0, pages: [] }))
        ).catch(() => {});
        await finishJob(edition.id, 'failed', 0, error instanceof Error ? error.message : 'unknown error');
      }).finally(() => {
        if (!current.failed) jobs.delete(version);
      });
      state.newspaperReaderQueue = current.done.catch(() => {});
      jobs.set(version, current);
      if (disk?.status === 'failed') disk = null;
    }
  }

  const value = disk ?? { status: job?.failed ? 'failed' as const : 'preparing' as const, numPages: 0, pages: [] };
  return { done: job?.done ?? Promise.resolve(), preview: {
    id: edition.id, pdfUrl: edition.pdf_url, version,
    status: value.status, numPages: value.numPages,
    pages: value.pages.map(page => ({ ...page, url: `/api/reader/${edition.id}/${page.n}?v=${version}` })),
  } };
}
