'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Trash2, Eye, EyeOff, FileText, Wand2, Pencil, X, Pause } from 'lucide-react';
import type { Edition } from '@/lib/types';
import { formatMonthEs, issueLabel } from '@/lib/utils';
import { isDemoMode } from '@/lib/demo';
import { analyzePdf } from '@/lib/analyze-pdf';
import { removeObjects } from '@/lib/storage-upload';
import { createEditionUpload, completedEditionUploads, transferEditionFiles, type EditionUploadAttempt } from '@/lib/edition-upload';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { requestJson } from '@/lib/request-json';
import { ContentFilter } from '@/components/content-filter';
import { PdfPageOrder } from './pdf-page-order';

type EditionField = 'number' | 'title' | 'description' | 'edition_date' | 'school_year';
type PageOrderMode = 'automatic' | 'manual';

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
  demo,
  admin,
  currentUserId,
}: {
  initialEditions: Edition[];
  demo: boolean;
  admin: boolean;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const visible = initialEditions.filter(edition => edition.title.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || edition.published === (status === 'published')));
  const [msg, setMsg] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [orderMode, setOrderMode] = useState<PageOrderMode>('automatic');
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingEdition, setEditingEdition] = useState<Edition | null>(null);
  const manuallyEditedRef = useRef(new Set<EditionField>());
  const analysisRunRef = useRef(0);
  // Upload progress (0-100) while sending the PDF; null when idle.
  const [progress, setProgress] = useState<number | null>(null);
  const [transferStatus, setTransferStatus] = useState('');
  const [transferBytes, setTransferBytes] = useState<{ sent: number; total: number } | null>(null);
  const uploadAttempt = useRef<EditionUploadAttempt | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'saving'>('idle');
  useEffect(() => () => {
    uploadController.current?.abort();
    if (uploadAttempt.current) void removeObjects(completedEditionUploads(uploadAttempt.current));
  }, []);
  function discardPendingUpload() {
    uploadController.current?.abort();
    if (uploadAttempt.current) void removeObjects(completedEditionUploads(uploadAttempt.current));
    uploadAttempt.current = null;
    setProgress(null); setTransferBytes(null); setTransferStatus('');
  }
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
    discardPendingUpload();
    // Any analysis still running belongs to the previous form: cancel it so it
    // cannot fill this edition's fields or attach its PDF as a replacement.
    analysisRunRef.current += 1;
    setAnalyzing(false);
    manuallyEditedRef.current.clear();
    setEditingEdition(ed);
    setSourceFile(null);
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
    discardPendingUpload();
    manuallyEditedRef.current.clear();
    analysisRunRef.current += 1;
    setAnalyzing(false);
    setEditingEdition(null);
    setSourceFile(null);
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

  function handlePdfChange(f: File | null, mode = orderMode, resetMetadata = true) {
    discardPendingUpload();
    analysisRunRef.current += 1;
    setSourceFile(null);
    setFile(null);
    setCover(null);
    setAnalyzing(false);
    setMsg(null);
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      setMsg('The PDF is larger than 50 MB. Export a smaller copy and try again.');
      return;
    }
    setSourceFile(f);
    if (resetMetadata && !editingEdition) {
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
    if (mode === 'automatic') void preparePdf(f);
  }

  async function preparePdf(f: File, manualOrder?: number[]) {
    const runId = ++analysisRunRef.current;
    setAnalyzing(true);
    setMsg(manualOrder ? 'Applying your page order and preparing the cover…' : 'Checking printed page numbers and preparing the first-page cover…');
    try {
      const onProgress = (message: string) => {
        if (runId === analysisRunRef.current) setMsg(message);
      };
      const a = manualOrder ? await analyzePdf(f, onProgress, manualOrder) : await analyzePdf(f, onProgress);
      if (runId !== analysisRunRef.current) return;
      if (a.file.size > 50 * 1024 * 1024) throw new Error('The reordered PDF is larger than 50 MB. Export a smaller copy and try again.');
      setFile(a.file);
      setCover(a.cover);
      const orderStatus = manualOrder
        ? `Order confirmed for ${a.pageCount} pages.`
        : a.pageOrderChanged
        ? `Reordered ${a.pageCount} pages by their printed numbers.`
        : `Verified the printed-number order of all ${a.pageCount} pages.`;
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

      if (manualOrder && (editingEdition || manuallyEditedRef.current.has('description'))) {
        setMsg(`Order confirmed for ${a.pageCount} pages. The cover is ready. Review the issue details before saving.`);
        return;
      }

      if (a.text.length < 20) {
        setMsg(
          `${orderStatus} The cover is ready, but the first pages have too little selectable text for Gemini. Fill in the metadata manually.`
        );
        return;
      }

      setMsg(`${orderStatus} Asking Gemini to suggest the issue metadata…`);
      try {
        const response = await fetch('/api/analyze-edition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: a.text, title: a.title ?? form.title }),
          signal: AbortSignal.timeout(45000),
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
            ? `${orderStatus} Gemini suggested a description. Review the fields before saving.`
            : `${orderStatus} Gemini could not suggest a description. You can write one manually.`
        );
      } catch (err) {
        if (runId !== analysisRunRef.current) return;
        setMsg(
          `${orderStatus} The PDF and cover are ready, but Gemini could not analyze the metadata: ${
            err instanceof Error ? err.message : 'Unexpected error'
          }`
        );
      }
    } catch (err) {
      // A superseded run must not clear the file the user just picked.
      if (runId !== analysisRunRef.current) return;
      setFile(null);
      setCover(null);
      const message = err instanceof Error ? err.message : 'Could not prepare the PDF.';
      setMsg(manualOrder ? message : `${message} You can switch to Manual order to arrange the selected PDF.`);
    } finally {
      if (runId === analysisRunRef.current) setAnalyzing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || analyzing) return;
    if (sourceFile && !file) {
      setMsg(orderMode === 'manual' ? 'Confirm the page order before saving.' : 'Prepare the selected PDF before saving, or remove it.');
      return;
    }
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
    setUploadStage('uploading');
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const session = await getSupabaseBrowserClient()?.auth.getUser();
      const userId = session?.data.user?.id;
      if (!userId) throw new Error('Sign in again before uploading.');
      let coverPath: string | null = null;
      let pdfPath: string | null = null;
      let editionId = editingEdition?.id;

      if (file && cover) {
        if (!uploadAttempt.current || uploadAttempt.current.file !== file || uploadAttempt.current.cover !== cover || uploadAttempt.current.userId !== userId) {
          if (uploadAttempt.current) void removeObjects(completedEditionUploads(uploadAttempt.current));
          uploadAttempt.current = createEditionUpload(file, cover, userId, form.title, editingEdition?.id);
        }
        const attempt = uploadAttempt.current;
        await transferEditionFiles(attempt, { signal: controller.signal, onStatus: setTransferStatus, onProgress: (sent, total) => {
          setProgress(Math.min(100, Math.round(sent / total * 100)));
          setTransferBytes({ sent, total });
        } });
        pdfPath = attempt.pdfPath; coverPath = attempt.coverPath; editionId = attempt.editionId;
      }

      setUploadStage('saving');
      setTransferStatus('Files uploaded. Saving the issue…');
      const res = await fetch('/api/editions', {
        method: editingEdition ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          ...(editionId ? { id: editionId } : {}),
          number: form.number || '0',
          title: form.title,
          description: form.description,
          edition_date: form.edition_date,
          school_year: form.school_year || currentYear,
          ...(pdfPath && coverPath ? { pdf_path: pdfPath, cover_path: coverPath } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Upload failed (HTTP ${res.status})`);
      }
      uploadAttempt.current = null;
      setProgress(null); setTransferBytes(null); setTransferStatus('');
      setMsg(
        typeof json.warning === 'string'
          ? json.warning
          : editingEdition
            ? 'Issue updated.'
            : 'Issue created! You can publish it whenever you like.'
      );
      setEditingEdition(null);
      setSourceFile(null);
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
      // Keep completed objects and the TUS URL so retry never starts over.
      const paused = err instanceof Error && err.name === 'AbortError';
      setTransferStatus(paused ? 'Upload paused. Your progress is kept on this page.' : 'Your upload progress is kept on this page.');
      setMsg(paused ? 'Press Resume upload when you are ready.' : err instanceof Error ? err.message : 'Could not save the issue. Please retry.');
    } finally {
      setBusy(false);
      setUploadStage('idle');
      uploadController.current = null;
    }
  }

  async function togglePublish(ed: Edition) {
    if (demo) { setMsg('Demo mode: changes are not saved.'); return; }
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await requestJson('/api/editions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ed.id, published: !ed.published }) }); router.refresh(); }
    catch (error) { setMsg(error instanceof Error ? error.message : 'Could not update the issue.'); }
    finally { setBusy(false); }
  }

  async function remove(ed: Edition) {
    if (demo) { setMsg('Demo mode: changes are not saved.'); return; }
    if (!confirm(`Delete "${ed.title}"? This cannot be undone.`)) return;
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await requestJson(`/api/editions?id=${ed.id}`, { method: 'DELETE' }); router.refresh(); }
    catch (error) { setMsg(error instanceof Error ? error.message : 'Could not delete the issue.'); }
    finally { setBusy(false); }
  }

  const nextNumber =
    initialEditions.reduce((max, e) => Math.max(max, e.number), 0) + 1;

  return (
    <div className="admin-manager-grid grid gap-6">
      <form
        onSubmit={handleSubmit}
        className="panel rounded-xl p-5 space-y-3 h-fit"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="masthead text-xl font-bold">
            {editingEdition ? 'Edit issue' : 'New issue'}
          </h2>
          {editingEdition && <button
            type="button"
            onClick={cancelEditing}
            disabled={busy}
            className="inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink disabled:opacity-50"
          >
            <X size={16} /> Cancel editing
          </button>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edition-number" className="block text-xs font-semibold mb-1">Number</label>
            <input
              disabled={busy}
            id="edition-number"
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
            <label htmlFor="edition-date" className="block text-xs font-semibold mb-1">Date</label>
            <input
              disabled={busy}
            id="edition-date"
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
          <label htmlFor="edition-title" className="block text-xs font-semibold mb-1">Title</label>
          <input
            disabled={busy}
            id="edition-title"
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
          <label htmlFor="edition-description" className="block text-xs font-semibold mb-1">Description (optional)</label>
          <textarea
            disabled={busy}
            id="edition-description"
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
          <label htmlFor="edition-school-year" className="block text-xs font-semibold mb-1">School year</label>
          <input
            disabled={busy}
            id="edition-school-year"
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
          <label htmlFor="edition-page-order" className="mb-1 block text-xs font-semibold">Page order</label>
          <select
            id="edition-page-order"
            value={orderMode}
            disabled={busy || analyzing}
            onChange={event => {
              const mode = event.target.value === 'manual' ? 'manual' : 'automatic';
              setOrderMode(mode);
              if (sourceFile) handlePdfChange(sourceFile, mode, false);
            }}
            className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
          >
            <option value="automatic">Automatic (printed page numbers)</option>
            <option value="manual">Manual (arrange thumbnails)</option>
          </select>
        </div>

        <div>
          <label htmlFor="edition-pdf" className="block text-xs font-semibold mb-1">
            Newspaper PDF {editingEdition ? '(optional; leave empty to keep current file)' : '*'}{' '}
            {analyzing && (
              <span className="text-ink/50 font-normal inline-flex items-center gap-1">
                <Wand2 size={12} className="inline animate-pulse" /> analyzing…
              </span>
            )}
          </label>
          <input
            disabled={busy}
            ref={pdfInputRef}
            id="edition-pdf"
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
          {sourceFile && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink/60">
              <span className="break-all">{sourceFile.name} · {((file ?? sourceFile).size / 1048576).toFixed(1)} MB</span>
              <button type="button" disabled={busy} onClick={() => {
                if (pdfInputRef.current) pdfInputRef.current.value = '';
                handlePdfChange(null);
              }} className="text-brand underline disabled:opacity-50">Remove selected PDF</button>
            </div>
          )}
        </div>

        {sourceFile && orderMode === 'manual' && (
          <PdfPageOrder
            file={sourceFile}
            disabled={busy || analyzing}
            confirmed={!!file && !!cover}
            onChange={() => {
              if (file) discardPendingUpload();
              setFile(null);
              setCover(null);
              setMsg(null);
            }}
            onConfirm={order => void preparePdf(sourceFile, order)}
          />
        )}

        <div className="text-xs text-ink/60">
          {cover
            ? 'Cover generated from the first page in the confirmed order.'
            : sourceFile
              ? 'The first page in the final order will be used as the cover.'
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

        {progress !== null && <div className="panel-note space-y-2 rounded-lg p-3 text-sm">
          <p role="status">{transferStatus}</p>
          <div role="progressbar" aria-label="Issue file upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-brand/10"><div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
          <p className="text-xs tabular-nums">{progress}%{transferBytes && ` · ${(transferBytes.sent / 1048576).toFixed(1)} / ${(transferBytes.total / 1048576).toFixed(1)} MB`}</p>
          <p className="text-xs text-ink/60">Keep this page open. Interrupted PDF uploads resume from the last saved block.</p>
          {uploadStage === 'uploading' && <button type="button" onClick={() => uploadController.current?.abort()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand"><Pause size={15} />Pause upload</button>}
        </div>}

        {msg && (
          <p
            role="status"
            aria-live="polite"
            className="panel-note rounded-lg px-3 py-2 text-sm"
          >
            {msg}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || analyzing || !!(sourceFile && !file)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand text-paper py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50"
        >
          {analyzing ? <Wand2 size={16} className="animate-pulse" /> : editingEdition ? <Pencil size={16} /> : <Upload size={16} />}{' '}
          {analyzing
            ? 'Analyzing PDF…'
            : busy
            ? uploadStage === 'saving'
              ? 'Saving issue…'
              :
              progress !== null && progress < 100
              ? `Uploading… ${progress}%`
              : 'Processing…'
            : uploadAttempt.current
              ? uploadAttempt.current.pdfDone && uploadAttempt.current.coverDone ? 'Retry save' : 'Resume upload'
            : editingEdition
              ? 'Save changes'
              : 'Upload issue'}
        </button>
      </form>

      <div>
        <h2 className="masthead editorial-rule mb-4 border-b pb-2 text-2xl font-bold">All issues</h2>
        <ContentFilter query={query} setQuery={setQuery} status={status} setStatus={setStatus} />
        {visible.length === 0 ? (
          <p className="panel rounded-xl p-8 text-center text-ink/60 text-sm">{initialEditions.length === 0 ? 'No issues yet. Create the first one!' : 'No issues match this search.'}</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((ed) => (
              <li
                key={ed.id}
                className="panel flex items-center gap-3 rounded-xl p-3"
              >
                <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <FileText size={20} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {issueLabel(ed.number) && `${issueLabel(ed.number)} · `}{ed.title}
                  </p>
                  <p className="text-xs text-ink/60">
                    {formatMonthEs(ed.edition_date)} · School year {ed.school_year}
                  </p>
                  <span className={`status-badge mt-2 ${ed.published ? 'status-live' : 'status-pending'}`}>{ed.published ? 'Published' : 'Draft'}</span>
                </div>
                <button
                  onClick={() => startEditing(ed)}
                  title="Edit issue"
                  aria-label={`Edit ${ed.title}`}
                  disabled={busy || analyzing || (!demo && !admin && ed.created_by !== currentUserId)}
                  className="p-2 rounded-lg hover:bg-ink/5 disabled:opacity-40"
                >
                  <Pencil size={18} />
                </button>
                <button
                  onClick={() => togglePublish(ed)}
                  title={ed.published ? 'Unpublish' : 'Publish'}
                  aria-label={`${ed.published ? 'Unpublish' : 'Publish'} ${ed.title}`}
                  disabled={busy || analyzing || (!demo && !admin && ed.created_by !== currentUserId)}
                  className="p-2 rounded-lg hover:bg-ink/5 disabled:opacity-40"
                >
                  {ed.published ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button
                  onClick={() => remove(ed)}
                  title="Delete"
                  aria-label={`Delete ${ed.title}`}
                  disabled={busy || analyzing || (!demo && !admin)}
                  className="p-2 rounded-lg hover:bg-ink/10 text-ink disabled:opacity-40"
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
