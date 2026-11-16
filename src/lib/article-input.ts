export function articleInputError(body: Record<string, unknown>): string | null {
  const title = String(body.title ?? '').trim();
  const text = String(body.body ?? '').trim();
  if (!title || !text) return 'Title and body are required.';
  if (title.length > 200 || text.length > 100000) return 'The title or article body is too long.';
  for (const field of ['image_url', 'video_url', 'audio_url']) {
    const value = String(body[field] ?? '').trim();
    if (!value) continue;
    if (field === 'image_url' && /^\/(?!\/)[^\\\u0000-\u0020]*$/.test(value)) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return 'Media links must be valid HTTPS URLs.';
    } catch { return 'Media links must be valid HTTPS URLs.'; }
  }
  return null;
}
