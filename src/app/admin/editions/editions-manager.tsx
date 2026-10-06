'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Trash2, Eye, EyeOff, FileText, Wand2, Pencil, X } from 'lucide-react';
import type { Edition } from '@/lib/types';
import { formatMonthEs } from '@/lib/utils';
import { isDemoMode } from '@/lib/demo';
import { analyzePdf } from '@/lib/analyze-pdf';
import { issueLabel } from '@/lib/utils';

type EditionField = 'number' | 'title' | 'description' | 'edition_date' | 'school_year';

interface AnalyzedEdition {
  number?: number | null;
  title?: string | null;
  description?: string | null;
  editionDate?: string | null;
  schoolYear?: string | null;
  error?: string;
}

export function EditionsManager({
  initialEditions,
}: {
  initialEditions: Edition[];
  demo: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingEdition, setEditingEdition] = useState<Edition | null>(null);
  const manuallyEditedRef = useRef(new Set<EditionField>());
  const analysisRunRef = useRef(0);
  // Upload progress (0-100) while sending the PDF; null when idle.
  const [progress, setProgress] = useState<number | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    number: '',
    title: '',
    description: '',
    edition_date: new Date().toISOString().slice(0, 10),
    school_year: '',
  });

  const currentYear =
    new Date().getMonth() >= 7
      ? `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`
      : `${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(2)}`;

  function startEditing(ed: Edition) {
    manuallyEditedRef.current.clear();
    setEditingEdition(ed);
    setFile(null);
    setCover(null);
    setForm({
      number: ed.number ? String(ed.number) : '',
      title: ed.title,
      description: ed.description ?? '',
      edition_date: ed.edition_date,
      school_year: ed.school_year,
    });
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    setMsg(null);
  }

  function cancelEditing() {
    manuallyEditedRef.current.clear();
    analysisRunRef.current += 1;
    setAnalyzing(false);
    setEditingEdition(null);
    setFile(null);
    setCover(null);
    setForm({
      number: '',
      title: '',
      description: '',
      edition_date: new Date().toISOString().slice(0, 10),
      school_year: '',
    });
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    setMsg(null);
  }

  /** Extract local PDF metadata, then ask Gemini to fill or improve the fields. */
  async function handlePdfChange(f: File | null) {
    const runId = ++analysisRunRef.current;
    setFile(f);
    if (!f) {
      setCover(null);
      setAnalyzing(false);
      return;
    }
    setCover(null);
    if (!editingEdition) {
      setForm((prev) => ({
        ...prev,
        number: manuallyEditedRef.current.has('number') ? prev.number : '',
        title: manuallyEditedRef.current.has('title') ? prev.title : '',
        description: manuallyEditedRef.current.has('description') ? prev.description : '',
        edition_date: manuallyEditedRef.current.has('edition_date')
          ? prev.edition_date
          : new Date().toISOString().slice(0, 10),
        school_year: manuallyEditedRef.current.has('school_year') ? prev.school_year : '',
      }));
    }
    setAnalyzing(true);
    setMsg('Reading the PDF and extracting its first-page cover…');
    try {
      const a = await analyzePdf(f);
      if (runId !== analysisRunRef.current) return;
      setCover(a.cover);
      setForm((prev) => ({
        ...prev,
        number:
          prev.number ||
          (editingEdition || manuallyEditedRef.current.has('number') ? '' : String(nextNumber)),
        title:
          editingEdition || manuallyEditedRef.current.has('title')
            ? prev.title
            : a.title || prev.title,
        edition_date:
          editingEdition || manuallyEditedRef.current.has('edition_date')
            ? prev.edition_date
            : a.editionDate ?? prev.edition_date,
        school_year:
          editingEdition || manuallyEditedRef.current.has('school_year')
            ? prev.school_year
            : a.schoolYear || prev.school_year,
      }));

      if (a.text.length < 20) {
        setMsg(
          'The cover was generated, but this PDF has too little selectable text for Gemini. Fill in the metadata manually.'
        );
        return;
      }

      setMsg('PDF read. Asking Gemini to suggest the issue metadata…');
      try {
        const response = await fetch('/api/analyze-edition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: a.text, title: a.title ?? form.title }),
        });
        const result = (await response.json()) as AnalyzedEdition;
        if (runId !== analysisRunRef.current) return;
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? 'Sign in to the editor panel again to use Gemini.'
              : result.error || `Gemini analysis failed (HTTP ${response.status}).`
          );
        }

        setForm((prev) => ({
          ...prev,
          number:
            !editingEdition && !manuallyEditedRef.current.has('number') && result.number
              ? String(result.number)
              : prev.number || String(nextNumber),
          title:
            !editingEdition && !manuallyEditedRef.current.has('title')
              ? result.title || prev.title
              : prev.title,
          description:
            !editingEdition && !manuallyEditedRef.current.has('description')
              ? result.description || prev.description
              : prev.description,
          edition_date:
            !editingEdition && !manuallyEditedRef.current.has('edition_date')
              ? result.editionDate || prev.edition_date
              : prev.edition_date,
          school_year:
            !editingEdition && !manuallyEditedRef.current.has('school_year')
              ? result.schoolYear || prev.school_year
              : prev.school_year,
        }));
        setMsg(
          result.description
            ? 'Gemini analyzed the PDF and suggested a description. Review the fields before saving.'
            : 'Gemini analyzed the PDF, but could not find enough information to suggest a description. You can write one manually.'
        );
      } catch (err) {
        if (runId !== analysisRunRef.current) return;
        setMsg(
          `The PDF and cover are ready, but Gemini could not analyze the metadata: ${
            err instanceof Error ? err.message : 'Unexpected error'
          }`
        );
      }
    } catch {
      setFile(null);
      setCover(null);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      setMsg('Could not read the PDF and generate its first-page cover. Please choose a valid PDF and try again.');
    } finally {
      if (runId === analysisRunRef.current) setAnalyzing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (isDemoMode()) {
      setMsg('Demo mode: set up Supabase to publish real issues.');
      return;
    }
    if (!editingEdition && (!file || !cover)) {
      setMsg('Select the newspaper PDF.');
      return;
    }
    if (file && !cover) {
      setMsg('The first-page cover could not be generated. Please choose the PDF again.');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const body = new FormData();
      if (file) body.set('pdf', file);
      if (cover) body.set('cover', cover);
      if (editingEdition) body.set('id', editingEdition.id);
      body.set('number', form.number || '0');
      body.set('title', form.title);
      body.set('description', form.description);
      body.set('edition_date', form.edition_date);
      body.set('school_year', form.school_year || currentYear);

      // XHR instead of fetch: reports upload progress and can time out.
      // With a large PDF (40+ MB) a plain fetch sat silent for minutes and
      // the button looked frozen; now it shows % and always recovers.
      const json = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(editingEdition ? 'PATCH' : 'POST', '/api/editions');
        xhr.responseType = 'text';
        // 5 min hard cap: enough for big PDFs, short enough to always recover.
        xhr.timeout = 5 * 60 * 1000;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(xhr.responseText) as Record<string, unknown>;
          } catch {
            // Non-JSON error page (e.g. proxy 413): fall through to the status check.
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error((data.error as string) ?? `Upload failed (HTTP ${xhr.status})`));
        };
        xhr.onerror = () =>
          reject(new Error('Network error while uploading. Check your connection and try again.'));
        xhr.ontimeout = () =>
          reject(new Error('The upload took too long and was cancelled. Try again, or use a smaller PDF.'));
        xhr.send(body);
      });

      if (json.error) throw new Error(String(json.error));
      setMsg(
        typeof json.warning === 'string'
          ? json.warning
          : editingEdition
            ? 'Issue updated.'
            : 'Issue created! You can publish it whenever you like.'
      );
      setEditingEdition(null);
      setFile(null);
      setCover(null);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      setForm({
        number: '',
        title: '',
        description: '',
        edition_date: new Date().toISOString().slice(0, 10),
        school_year: '',
      });
      manuallyEditedRef.current.clear();
      analysisRunRef.current += 1;
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function togglePublish(ed: Edition) {
    const res = await fetch('/api/editions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ed.id, published: !ed.published }),
    });
    if (!res.ok) setMsg('Could not update the issue. Please try again.');
    router.refresh();
  }

  async function remove(ed: Edition) {
    if (!confirm(`Delete "${ed.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/editions?id=${ed.id}`, { method: 'DELETE' });
    if (!res.ok) setMsg('Could not delete the issue. Please try again.');
    router.refresh();
  }

  const nextNumber =
    initialEditions.reduce((max, e) => Math.max(max, e.number), 0) + 1;

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-8">
      <form
        onSubmit={handleSubmit}
        data-lg-surface
        className="lg-glass rounded-xl border border-ink/10 p-5 space-y-3 h-fit"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="masthead text-xl font-bold">
            {editingEdition ? 'Edit issue' : 'New issue'}
          </h2>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={busy}
            className="inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink disabled:opacity-50"
          >
            <X size={16} /> Cancel editing
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Number</label>
            <input
              type="number"
              min={1}
              value={form.number}
              onChange={(e) => {
                manuallyEditedRef.current.add('number');
                setForm({ ...form, number: e.target.value });
              }}
              placeholder={String(nextNumber)}
              className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Date</label>
            <input
              type="date"
              value={form.edition_date}
              onChange={(e) => {
                manuallyEditedRef.current.add('edition_date');
                setForm({ ...form, edition_date: e.target.value });
              }}
              className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => {
              manuallyEditedRef.current.add('title');
              setForm({ ...form, title: e.target.value });
            }}
            placeholder="e.g. Christmas Special"
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => {
              manuallyEditedRef.current.add('description');
              setForm({ ...form, description: e.target.value });
            }}
            rows={2}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">School year</label>
          <input
            value={form.school_year}
            onChange={(e) => {
              manuallyEditedRef.current.add('school_year');
              setForm({ ...form, school_year: e.target.value });
            }}
            placeholder={currentYear}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">
            Newspaper PDF {editingEdition ? '(optional; leave empty to keep current file)' : '*'}{' '}
            {analyzing && (
              <span className="text-ink/50 font-normal inline-flex items-center gap-1">
                <Wand2 size={12} className="inline animate-pulse" /> analyzing…
              </span>
            )}
          </label>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            required={!editingEdition}
            onChange={(e) => handlePdfChange(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
          {editingEdition && (
            <a
              href={editingEdition.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-xs text-brand hover:underline"
            >
              View current PDF
            </a>
          )}
          {file && (
            <p className="text-xs text-ink/60 mt-1">
              {file.name} · {(file.size / 1048576).toFixed(1)} MB
            </p>
          )}
        </div>

        <div className="text-xs text-ink/60">
          {cover
            ? 'Cover generated automatically from the first page of the selected PDF.'
            : editingEdition?.cover_url
              ? 'The current cover will be kept unless you select a replacement PDF.'
              : 'The first page of the selected PDF will be used as the cover.'}
          {editingEdition?.cover_url && (
            <a
              href={editingEdition.cover_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-brand hover:underline"
            >
              View current cover
            </a>
          )}
        </div>

        {msg && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm rounded-lg bg-paper px-3 py-2"
          >
            {msg}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || analyzing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50"
        >
          {analyzing ? <Wand2 size={16} className="animate-pulse" /> : editingEdition ? <Pencil size={16} /> : <Upload size={16} />}{' '}
          {analyzing
            ? 'Analyzing PDF…'
            : busy
            ? progress !== null && progress < 100
              ? `Uploading… ${progress}%`
              : 'Processing…'
            : editingEdition
              ? 'Save changes'
              : 'Upload issue'}
        </button>
      </form>

      <div>
        <h2 className="masthead text-xl font-bold mb-4">All issues</h2>
        {initialEditions.length === 0 ? (
          <p className="text-ink/60 text-sm">No issues yet. Create the first one!</p>
        ) : (
          <ul className="space-y-3">
            {initialEditions.map((ed) => (
              <li
                key={ed.id}
                data-lg-static
                className="lg-glass flex items-center gap-3 rounded-xl border border-ink/10 p-3"
              >
                <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <FileText size={20} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {issueLabel(ed.number) && `${issueLabel(ed.number)} · `}{ed.title}
                    {!ed.published && (
                      <span className="ml-2 text-xs draft-badge rounded px-1.5 py-0.5">draft</span>
                    )}
                  </p>
                  <p className="text-xs text-ink/60">
                    {formatMonthEs(ed.edition_date)} · School year {ed.school_year}
                  </p>
                </div>
                <button
                  onClick={() => startEditing(ed)}
                  title="Edit issue"
                  aria-label={`Edit ${ed.title}`}
                  className="p-2 rounded-lg hover:bg-ink/5"
                >
                  <Pencil size={18} />
                </button>
                <button
                  onClick={() => togglePublish(ed)}
                  title={ed.published ? 'Unpublish' : 'Publish'}
                  className="p-2 rounded-lg hover:bg-ink/5"
                >
                  {ed.published ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button
                  onClick={() => remove(ed)}
                  title="Delete"
                  className="p-2 rounded-lg hover:bg-ink/10 text-ink"
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
