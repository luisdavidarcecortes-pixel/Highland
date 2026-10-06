/** Converts a title into a URL slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Formats an ISO date as "September 15, 2026". */
export function formatDateEs(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS_EN[m - 1]} ${d}, ${y}`;
}

/** Formats an ISO date as "September 2026". */
export function formatMonthEs(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m) return iso;
  return `${MONTHS_EN[m - 1]} ${y}`;
}

/** "No. N" label for an issue, or null when it has no real number (0/null/undefined). */
export function issueLabel(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? `No. ${n}` : null;
}

/** Extracts a YouTube video ID from any URL format. */
export function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Converts a YouTube URL into an embed URL, or returns it if it already is one. */
export function toYouTubeEmbed(url: string): string | null {
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

/** Returns true if the URL looks like an audio file (mp3/ogg/m4a). */
export function isAudioUrl(url: string): boolean {
  return /\.(mp3|ogg|m4a|wav)(\?.*)?$/i.test(url);
}
