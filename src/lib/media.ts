const BUCKET = 'newspaper';

export function mediaPath(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, 'http://local');
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (url.pathname.startsWith('/api/media/') && (value.startsWith('/api/media/') || (site && url.origin === new URL(site).origin))) {
      return decodeURIComponent(url.pathname.slice('/api/media/'.length));
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (base && url.origin === new URL(base).origin && url.pathname.startsWith(marker)) {
      return decodeURIComponent(url.pathname.slice(marker.length));
    }
  } catch { /* An external or invalid URL is not an object we may delete. */ }
  return null;
}

export function mediaUrl(path: string): string {
  return `/api/media/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function protectedMediaUrl(value: string | null, path?: string | null): string | null {
  const objectPath = path || mediaPath(value);
  return objectPath ? mediaUrl(objectPath) : value;
}

export function isOwnedUpload(path: string, userId: string, folder: string): boolean {
  const prefix = `${folder}/${userId}/`;
  return path.startsWith(prefix) && /^\d+-[a-z0-9-]{1,120}\.(pdf|jpg|png|webp|gif)$/.test(path.slice(prefix.length));
}
