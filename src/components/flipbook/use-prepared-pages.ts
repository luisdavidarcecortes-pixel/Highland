'use client';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { getReaderPreview, preloadMagazine, subscribeReaderPreview } from '@/lib/reader-preload';
import { PAGE_PLACEHOLDER } from '@/lib/reader-preview';
import type { PdfPagesResult } from './use-pdf-pages';

const serverSnapshot = () => null;
export function usePreparedPages(editionId: string | undefined, pdfUrl: string) {
  const state = useSyncExternalStore(subscribeReaderPreview, () => editionId ? getReaderPreview(editionId) : null, serverSnapshot);
  useEffect(() => { if (editionId) void preloadMagazine(editionId, pdfUrl); }, [editionId, pdfUrl]);
  const retry = useCallback(() => { if (editionId) void preloadMagazine(editionId, pdfUrl, true); }, [editionId, pdfUrl]);
  const preview = state?.value?.pdfUrl === pdfUrl ? state.value : null;
  const result: PdfPagesResult = useMemo(() => {
    const pages = Array<string>(preview?.numPages ?? 0).fill(PAGE_PLACEHOLDER);
    const texts = Array<string>(pages.length).fill('');
    for (const page of preview?.pages ?? []) { pages[page.n - 1] = page.url; texts[page.n - 1] = page.text; }
    const first = preview?.pages[0];
    return { pages, texts, aspect: first ? first.width / first.height : 0.75,
      ready: !!preview?.pages.length, numPages: pages.length, completed: preview?.pages.length ?? 0,
      error: null, failedPages: [], retry };
  }, [preview, retry]);
  return { failed: !editionId || !!state?.error, result };
}
