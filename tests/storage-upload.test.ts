import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ client: vi.fn(), resumable: vi.fn(), session: vi.fn(), rpc: vi.fn(), info: vi.fn() }));
vi.mock('../src/lib/supabase-browser', () => ({ getSupabaseBrowserClient: mock.client }));
vi.mock('../src/lib/resumable-upload', () => ({ UPLOAD_CHUNK_BYTES: 6 * 1024 * 1024, uploadResumable: mock.resumable }));
import { uploadObject } from '../src/lib/storage-upload';

const file = { size: 42 * 1024 * 1024 } as Blob;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key');
  mock.session.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
  mock.client.mockReturnValue({ auth: { getSession: mock.session }, rpc: mock.rpc, storage: { from: () => ({ info: mock.info }) } });
});
afterEach(() => vi.unstubAllEnvs());
describe('Storage upload selection and reconciliation', () => {
  it('uses resumable transport for a 42 MB PDF', async () => {
    mock.resumable.mockResolvedValue(undefined);
    await uploadObject('editions/owner/1.pdf', file, 'application/pdf');
    expect(mock.resumable).toHaveBeenCalledWith(file, expect.objectContaining({ path: 'editions/owner/1.pdf', contentType: 'application/pdf' }));
  });
  it('recognizes a committed object when its final upload response was lost', async () => {
    mock.rpc.mockResolvedValue({ data: true, error: null });
    // Storage info returns size/contentType at the top level, not metadata.size.
    mock.info.mockResolvedValue({ data: { size: file.size, contentType: 'application/pdf', metadata: {} }, error: null });
    const progress = vi.fn();
    await uploadObject('editions/owner/1.pdf', file, 'application/pdf', progress, { resume: true });
    expect(progress).toHaveBeenCalledWith(1); expect(mock.resumable).not.toHaveBeenCalled();
  });
  it('does not send an unauthenticated PDF as an anonymous upload', async () => {
    mock.session.mockResolvedValue({ data: { session: null }, error: null });
    await expect(uploadObject('editions/owner/1.pdf', file, 'application/pdf')).rejects.toThrow(/Sign in again/);
    expect(mock.resumable).not.toHaveBeenCalled();
  });
});
