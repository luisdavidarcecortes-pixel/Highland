export const LAST_PAGE_KEY = (id: string) => `highlander:lastpage:${id}`;

export function clampPage(page: number, count: number) {
  return Math.min(Math.max(1, count), Math.max(1, Number.isSafeInteger(page) ? page : 1));
}

/** An explicit page, including page 1, takes precedence over the saved position. */
export function initialReaderPage(search: string, saved: string | null) {
  const value = new URLSearchParams(search).get('page');
  const page = value !== null && /^\d+$/.test(value) ? Number(value) : NaN;
  if (Number.isSafeInteger(page) && page >= 1) return page;
  const remembered = Number(saved);
  return Number.isSafeInteger(remembered) && remembered >= 1 ? remembered : 1;
}

/** With showCover, page 1 stands alone; the remaining pages form even/odd pairs. */
export function visiblePageRange(page: number, count: number, portrait: boolean) {
  const current = clampPage(page, count);
  const first = portrait || current === 1 ? current : current - current % 2;
  return { first, last: portrait || first === 1 ? first : Math.min(first + 1, count) };
}
