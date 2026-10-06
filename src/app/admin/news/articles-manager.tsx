'use client';

import { useState } from 'react';
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

  /** Upload the chosen photo to Storage right away and keep its URL in the form. */
  async function handleImageChange(f: File | null) {
    setImageFile(f);
    setImagePreview(f ? URL.createObjectURL(f) : null);
    if (!f) {
      setForm((p) => ({ ...p, image_url: '' }));
      return;
    }
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.set('image', f);
      const res = await fetch('/api/upload-image', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setForm((p) => ({ ...p, image_url: json.url }));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Image upload failed');
      setImageFile(null);
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setMsg('News published!');
      setForm(EMPTY);
      setImageFile(null);
      setImagePreview(null);
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
        data-lg-surface
        className="lg-glass rounded-xl border border-ink/10 p-5 space-y-3 h-fit"
      >
        <h2 className="masthead text-xl font-bold">New article</h2>
        <div>
          <label className="block text-xs font-semibold mb-1">Title *</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Excerpt</label>
          <input
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Body *</label>
          <textarea
            required
            rows={8}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Image</label>
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
                  'JPG, PNG, WebP or GIF · up to 8 MB'
                )}
              </p>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">…or paste an Image URL</label>
          <input
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
          <label className="block text-xs font-semibold mb-1">Video URL (YouTube)</label>
          <input
            value={form.video_url}
            onChange={(e) => setForm({ ...form, video_url: e.target.value })}
            placeholder="https://youtube.com/watch?v=…"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Audio URL (podcast)</label>
          <input
            value={form.audio_url}
            onChange={(e) => setForm({ ...form, audio_url: e.target.value })}
            placeholder="https://…/episode.mp3"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50"
        >
          <Upload size={16} /> {busy ? 'Publishing…' : 'Publish article'}
        </button>
        {msg && <p className="text-sm rounded-lg bg-paper px-3 py-2">{msg}</p>}
      </form>

      <div>
        <h2 className="masthead text-xl font-bold mb-4">All articles</h2>
        {initialArticles.length === 0 ? (
          <p className="text-ink/60 text-sm">No articles yet.</p>
        ) : (
          <ul className="space-y-3">
            {initialArticles.map((a) => (
              <li
                key={a.id}
                data-lg-static
                className="lg-glass flex items-center gap-3 rounded-xl border border-ink/10 p-3"
              >
                <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <PenLine size={18} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{a.title}</p>
                  <p className="text-xs text-ink/60">{formatDateEs(a.created_at)}</p>
                </div>
                <button onClick={() => togglePublish(a)} className="p-2 rounded-lg hover:bg-ink/5" title="Publish/Unpublish">
                  {a.published ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button onClick={() => remove(a)} className="p-2 rounded-lg hover:bg-ink/10 text-ink" title="Delete">
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
