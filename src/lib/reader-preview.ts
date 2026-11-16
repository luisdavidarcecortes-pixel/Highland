export interface PreparedPage {
  n: number; width: number; height: number; text: string; bytes: number; url: string;
}
export interface ReaderPreview {
  id: string; pdfUrl: string; version: string;
  status: 'preparing' | 'ready' | 'failed'; numPages: number; pages: PreparedPage[];
}
export const PAGE_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#f5f2ec"/><text x="300" y="400" text-anchor="middle" font-size="22" fill="#6c675d">Preparing page…</text></svg>');
