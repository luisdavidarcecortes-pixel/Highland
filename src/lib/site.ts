/** Absolute site origin, without a trailing slash. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'http://localhost:3000';
}

/** Turns a site-relative path (or an already absolute URL) into an absolute URL. */
export function absoluteUrl(path: string): string {
  try {
    return new URL(path, `${siteUrl()}/`).toString();
  } catch {
    return path;
  }
}
