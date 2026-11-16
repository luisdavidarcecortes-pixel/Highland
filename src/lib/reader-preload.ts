import type { ReaderPreview } from './reader-preview';

type Entry = { value: ReaderPreview | null; error: boolean; updated: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<void>>();
const images = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const empty: Entry = { value: null, error: false, updated: 0 };
export const getReaderPreview = (id: string) => entries.get(id) ?? empty;
export const subscribeReaderPreview = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(id: string, entry: Entry) {
  entries.set(id, entry);
  for (const listener of listeners) listener();
}

async function warmImages(preview: ReaderPreview) {
  let next = 0;
  // Cache compressed image bytes without retaining twelve large decoded canvases.
  await Promise.all(Array.from({ length: Math.min(3, preview.pages.length) }, async () => {
    while (next < preview.pages.length) {
      const url = preview.pages[next++].url;
      if (!images.has(url)) {
        const task = fetch(url, { cache: 'default', signal: AbortSignal.timeout(20000) })
          .then(async response => { if (!response.ok) throw new Error('Page unavailable'); await response.arrayBuffer(); })
          .catch(() => { images.delete(url); });
        images.set(url, task);
      }
      await images.get(url);
    }
  }));
}

/** Starts on site entry; the viewer subscribes to the exact same request and cache. */
export function preloadMagazine(source = 'latest', expectedPdfUrl?: string, refresh = false): Promise<void> {
  const existing = entries.get(source);
  if (!refresh && existing?.value?.status === 'ready' && (!expectedPdfUrl || existing.value.pdfUrl === expectedPdfUrl) && Date.now() - existing.updated < 60000) return Promise.resolve();
  if (pending.has(source)) return pending.get(source)!;
  let alias: string | undefined;
  let work!: Promise<void>;
  work = (async () => {
    let id = source;
    const started = Date.now();
    try {
      do {
        const response = await fetch(`/api/reader/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('Reader unavailable');
        const preview: ReaderPreview = await response.json();
        if (!preview.id || !Array.isArray(preview.pages) || !Number.isSafeInteger(preview.numPages)) throw new Error('Invalid reader response');
        id = preview.id;
        alias = id;
        const entry = { value: preview, error: preview.status === 'failed', updated: Date.now() };
        publish(id, entry);
        if (source === 'latest') publish('latest', entry);
        // A visitor opening the reader during the warmup joins this job.
        if (!pending.has(id)) pending.set(id, work);
        await warmImages(preview);
        if (preview.status !== 'preparing') return;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } while (Date.now() - started < 300000);
      throw new Error('Reader preparation timed out');
    } catch {
      publish(alias ?? source, { value: entries.get(alias ?? source)?.value ?? null, error: true, updated: Date.now() });
    }
  })().finally(() => {
    if (pending.get(source) === work) pending.delete(source);
    if (alias && pending.get(alias) === work) pending.delete(alias);
  });
  pending.set(source, work);
  return work;
}
