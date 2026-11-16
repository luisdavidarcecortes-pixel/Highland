/** Absolute site origin, without a trailing slash. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  // Vercel tells every build the domain it assigned to the project, so the
  // first deploy already has correct canonical links, a sitemap and invitation
  // links before anyone types the address by hand.
  const vercel = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    ''
  ).trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;
  if (process.env.NODE_ENV === 'production') {
    // Canonical links, the sitemap and the invitation links would all point at
    // localhost: it is better to stop the deployment than to publish them.
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is required in production (the public origin of the site, e.g. https://thehighlander.org).',
    );
  }
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
