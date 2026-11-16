import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditionUpload, transferEditionFiles } from '../src/lib/edition-upload';
import { uploadObject } from '../src/lib/storage-upload';

vi.mock('../src/lib/storage-upload', () => ({ uploadObject: vi.fn() }));
const file = new File(['pdf bytes'], 'issue.pdf', { type: 'application/pdf' });
const cover = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
const options = () => ({ onProgress: vi.fn(), onStatus: vi.fn() });
beforeEach(() => vi.mocked(uploadObject).mockReset());

describe('edition upload retries', () => {
  it('keeps the PDF and paths when only the cover fails', async () => {
    const attempt = createEditionUpload(file, cover, 'owner', 'My issue');
    const id = attempt.editionId; const path = attempt.pdfPath;
    vi.mocked(uploadObject).mockResolvedValueOnce().mockRejectedValueOnce(new Error('offline'));
    await expect(transferEditionFiles(attempt, options())).rejects.toThrow('offline');
    expect(attempt.pdfDone).toBe(true); expect(attempt.coverDone).toBe(false);
    vi.mocked(uploadObject).mockResolvedValueOnce();
    const progress = options(); await transferEditionFiles(attempt, progress);
    expect(vi.mocked(uploadObject).mock.calls.map(call => call[0])).toEqual([path, attempt.coverPath, attempt.coverPath]);
    expect(vi.mocked(uploadObject).mock.calls[2][4]).toMatchObject({ resume: true });
    expect(attempt.editionId).toBe(id);
    expect(progress.onProgress).toHaveBeenLastCalledWith(file.size + cover.size, file.size + cover.size);
  });
  it('resumes a failed PDF using the same object instead of generating another path', async () => {
    const attempt = createEditionUpload(file, cover, 'owner', 'Title');
    vi.mocked(uploadObject).mockRejectedValueOnce(new DOMException('paused', 'AbortError'));
    await expect(transferEditionFiles(attempt, options())).rejects.toMatchObject({ name: 'AbortError' });
    vi.mocked(uploadObject).mockResolvedValue();
    await transferEditionFiles(attempt, options());
    const calls = vi.mocked(uploadObject).mock.calls;
    expect(calls[0][0]).toBe(calls[1][0]); expect(calls[1][4]).toMatchObject({ resume: true });
  });
  it('retries saving completed files without uploading any bytes again', async () => {
    const attempt = createEditionUpload(file, cover, 'owner', 'Title');
    vi.mocked(uploadObject).mockResolvedValue();
    await transferEditionFiles(attempt, options());
    vi.mocked(uploadObject).mockClear();
    await transferEditionFiles(attempt, options());
    expect(uploadObject).not.toHaveBeenCalled();
  });
});
