'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Trash2, Eye, EyeOff, PenLine, ImagePlus, Loader2 } from 'lucide-react';
import type { Article } from '@/lib/types';
import { formatDateEs } from '@/lib/utils';
import { isDemoMode } from '@/lib/demo';

const EMPTY = { title: '', excerpt: '', body: '', image_url: '', video_url: '', audio_url: '' };

export function ArticlesManager({
  initialArticles,
}: {
  initialArticles: Article[];
  demo: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Every pick gets an id: a slow upload that finishes after the user chose
  // another photo must not overwrite the newer URL or the newer preview.
  const uploadIdRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  /** Upload the chosen photo to Storage right away and keep its URL in the form. */
  async function handleImageChange(f: File | null) {
    const uploadId = ++uploadIdRef.current;
    setImageFile(f);
    clearPreview();
    const preview = f ? URL.createObjectURL(f) : null;
    previewUrlRef.current = preview;
    setImagePreview(preview);

    if (!f) {
      setUploadingImage(false);
      setForm((p) => ({ ...p, image_url: '' }));
      return;
    }
    // The previous photo's URL is invalid from this moment: publishing before
    // the new upload finishes must not silently attach the old image.
    setForm((p) => ({ ...p, image_url: '' }));
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.set('image', f);
      const res = await fetch('/api/upload-image', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (uploadId !== uploadIdRef.current) return;
      if (!res.ok) throw new Error(json.error ?? `Upload failed (HTTP ${res.status})`);
      setForm((p) => ({ ...p, image_url: json.url ?? '' }));
    } catch (err) {
      if (uploadId !== uploadIdRef.current) return;
      setMsg(err instanceof Error ? err.message : 'Image upload failed');
      setImageFile(null);
      setImagePreview(null);
      clearPreview();
    } finally {
      if (uploadId === uploadIdRef.current) setUploadingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (busy) return;
    if (uploadingImage) {
      setMsg('The photo is still uploading: wait for it to finish before publishing.');
      return;
    }
    if (isDemoMode()) {
      setMsg('Demo mode: set up Supabase to publish real news.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, published: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setMsg('News published!');
      setForm(EMPTY);
      setImageFile(null);
      setImagePreview(null);
      clearPreview();
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(a: Article) {
    const res = await fetch('/api/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, published: !a.published }),
    });
    if (!res.ok) setMsg('Could not update the article. Please try again.');
    router.refresh();
  }

  async function remove(a: Article) {
    if (!confirm('Delete this news article?')) return;
    const res = await fetch(`/api/articles?id=${a.id}`, { method: 'DELETE' });
    if (!res.ok) setMsg('Could not delete the article. Please try again.');
    router.refresh();
  }

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-8">
      <form
        onSubmit={handleSubmit}
        className="panel rounded-xl p-5 space-y-3 h-fit"
      >
        <h2 className="masthead text-xl font-bold">New article</h2>
        <div>
          <label htmlFor="article-title" className="block text-xs font-semibold mb-1">Title *</label>
          <input
            id="article-title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="article-excerpt" className="block text-xs font-semibold mb-1">Excerpt</label>
          <input
            id="article-excerpt"
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="article-body" className="block text-xs font-semibold mb-1">Body *</label>
          <textarea
            id="article-body"
            required
            rows={8}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="article-image" className="block text-xs font-semibold mb-1">Image</label>
          <div className="flex items-start gap-3">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="Preview"
                className="w-16 h-16 rounded-lg object-cover border border-ink/15"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg border border-dashed border-ink/25 flex items-center justify-center text-ink/40">
                <ImagePlus size={20} />
              </div>
            )}
            <div className="flex-1">
              <input
                id="article-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-ink/50 mt-1">
                {uploadingImage ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> uploading…
                  </span>
                ) : form.image_url ? (
                  '✓ photo uploaded'
                ) : (
                  'JPG, PNG, WebP or GIF · up to 4 MB'
                )}
              </p>
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="article-image-url" className="block text-xs font-semibold mb-1">…or paste an Image URL</label>
          <input
            id="article-image-url"
            value={form.image_url}
            onChange={(e) => {
              setForm({ ...form, image_url: e.target.value });
              setImagePreview(e.target.value || null);
              setImageFile(null);
            }}
            placeholder="https://…"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="article-video" className="block text-xs font-semibold mb-1">Video URL (YouTube)</label>
          <input
            id="article-video"
            value={form.video_url}
            onChange={(e) => setForm({ ...form, video_url: e.target.value })}
            placeholder="https://youtube.com/watch?v=…"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="article-audio" className="block text-xs font-semibold mb-1">Audio URL (podcast)</label>
          <input
            id="article-audio"
            value={form.audio_url}
            onChange={(e) => setForm({ ...form, audio_url: e.target.value })}
            placeholder="https://…/episode.mp3"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || uploadingImage}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50"
        >
          <Upload size={16} />{' '}
          {uploadingImage ? 'Uploading photo…' : busy ? 'Publishing…' : 'Publish article'}
        </button>
        {msg && <p role="status" aria-live="polite" className="panel-note rounded-lg px-3 py-2 text-sm">{msg}</p>}
      </form>

      <div>
        <h2 className="masthead editorial-rule mb-4 border-b pb-2 text-2xl font-bold">All articles</h2>
        {initialArticles.length === 0 ? (
          <p className="text-ink/60 text-sm">No articles yet.</p>
        ) : (
          <ul className="space-y-3">
            {initialArticles.map((a) => (
              <li
                key={a.id}
                className="panel flex items-center gap-3 rounded-xl p-3"
              >
                <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <PenLine size={18} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{a.title}</p>
                  <p className="text-xs text-ink/60">{formatDateEs(a.created_at)}</p>
                </div>
                <button
                  onClick={() => togglePublish(a)}
                  className="p-2 rounded-lg hover:bg-ink/5"
                  title="Publish/Unpublish"
                  aria-label={`${a.published ? 'Unpublish' : 'Publish'} ${a.title}`}
                >
                  {a.published ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button
                  onClick={() => remove(a)}
                  className="p-2 rounded-lg hover:bg-ink/10 text-ink"
                  title="Delete"
                  aria-label={`Delete ${a.title}`}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
