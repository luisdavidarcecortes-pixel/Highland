import { uploadObject } from './storage-upload';
import { slugify } from './utils';

export interface EditionUploadAttempt {
  userId: string;
  editionId: string;
  file: File;
  cover: File;
  pdfPath: string;
  coverPath: string;
  pdfDone: boolean;
  coverDone: boolean;
  pdfStarted: boolean;
  coverStarted: boolean;
}

export function createEditionUpload(file: File, cover: File, userId: string, title: string, editionId = crypto.randomUUID()): EditionUploadAttempt {
  const name = `${Date.now()}-${slugify(title).slice(0, 70) || 'issue'}-${crypto.randomUUID()}`;
  return { userId, editionId, file, cover, pdfPath: `editions/${userId}/${name}.pdf`, coverPath: `covers/${userId}/${name}.jpg`, pdfDone: false, coverDone: false, pdfStarted: false, coverStarted: false };
}

export function completedEditionUploads(attempt: EditionUploadAttempt): string[] {
  return [attempt.pdfDone ? attempt.pdfPath : null, attempt.coverDone ? attempt.coverPath : null].filter((path): path is string => Boolean(path));
}

/** Preserve object names and completed files until the metadata save succeeds. */
export async function transferEditionFiles(attempt: EditionUploadAttempt, options: {
  signal?: AbortSignal;
  onProgress: (sent: number, total: number) => void;
  onStatus: (message: string) => void;
}) {
  const total = attempt.file.size + attempt.cover.size;
  let pdfBytes = attempt.pdfDone ? attempt.file.size : 0;
  let coverBytes = attempt.coverDone ? attempt.cover.size : 0;
  const progress = () => options.onProgress(pdfBytes + coverBytes, total);
  progress();
  if (!attempt.pdfDone) {
    const resume = attempt.pdfStarted; attempt.pdfStarted = true;
    options.onStatus(resume ? 'Resuming the PDF upload…' : 'Uploading the PDF…');
    await uploadObject(attempt.pdfPath, attempt.file, 'application/pdf', fraction => {
      pdfBytes = fraction * attempt.file.size; progress();
    }, { signal: options.signal, onStatus: options.onStatus, resume });
    attempt.pdfDone = true;
    pdfBytes = attempt.file.size;
  }
  if (!attempt.coverDone) {
    const resume = attempt.coverStarted; attempt.coverStarted = true;
    options.onStatus('Uploading the cover…');
    await uploadObject(attempt.coverPath, attempt.cover, 'image/jpeg', fraction => {
      coverBytes = fraction * attempt.cover.size; progress();
    }, { signal: options.signal, onStatus: options.onStatus, resume });
    attempt.coverDone = true;
    coverBytes = attempt.cover.size;
  }
  progress();
}
