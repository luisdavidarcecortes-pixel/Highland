import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash, randomFillSync } from 'node:crypto';
import { uploadResumable, UPLOAD_CHUNK_BYTES } from '../src/lib/resumable-upload';

// Node has no localStorage. Model the browser's persistent TUS URL storage,
// while retaining the real TUS client and real HTTP requests for this test.
const savedUrls = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('tus-js-client', async importOriginal => {
  const actual = await importOriginal<typeof import('tus-js-client')>();
  const urlStorage = {
    findAllUploads: async () => [...savedUrls.values()],
    findUploadsByFingerprint: async (fingerprint: string) => [...savedUrls.values()].filter(item => item.fingerprint === fingerprint),
    removeUpload: async (key: string) => { savedUrls.delete(key); },
    addUpload: async (fingerprint: string, upload: object) => {
      const key = `${savedUrls.size}`; savedUrls.set(key, { ...upload, fingerprint, urlStorageKey: key }); return key;
    },
  };
  return { ...actual, Upload: class extends actual.Upload {
    constructor(file: Buffer, options: ConstructorParameters<typeof actual.Upload>[1]) {
      super(file, { ...options, urlStorage: urlStorage as never });
    }
  } };
});

let projectUrl = '';
let parts: Buffer[] = [];
let offset = 0;
let total = 0;
let creates = 0;
let heads = 0;
let largestChunk = 0;
let dropResponse = false;
let rejectExpiredToken = false;
const offsets: number[] = [];
const server = createServer(async (request, response) => {
  response.setHeader('Tus-Resumable', '1.0.0');
  if (rejectExpiredToken && request.headers.authorization === 'Bearer expired') {
    request.resume(); response.writeHead(401).end(); return;
  }
  if (request.method === 'HEAD') {
    heads++;
    response.writeHead(200, { 'Upload-Offset': String(offset), 'Upload-Length': String(total) }).end(); return;
  }
  if (request.method !== 'POST' && request.method !== 'PATCH') { response.writeHead(405).end(); return; }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  largestChunk = Math.max(largestChunk, body.length);
  if (request.method === 'POST') {
    creates++; total = Number(request.headers['upload-length']);
    parts = [body]; offset = body.length;
    response.writeHead(201, { Location: `${projectUrl}/storage/v1/upload/resumable/test-upload`, 'Upload-Offset': String(offset) }).end(); return;
  }
  const requestedOffset = Number(request.headers['upload-offset']);
  offsets.push(requestedOffset);
  if (requestedOffset !== offset) { response.writeHead(409).end(); return; }
  parts.push(body); offset += body.length;
  if (dropResponse) { dropResponse = false; request.socket.destroy(); return; }
  response.writeHead(204, { 'Upload-Offset': String(offset) }).end();
});
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  projectUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => {
  savedUrls.clear(); parts = []; offset = 0; total = 0; creates = 0; heads = 0; largestChunk = 0;
  offsets.length = 0; dropResponse = false; rejectExpiredToken = false;
});

function input(bytes: number) {
  const buffer = randomFillSync(Buffer.alloc(bytes));
  Object.defineProperty(buffer, 'size', { value: bytes });
  return buffer as unknown as Blob;
}
function options() {
  return { projectUrl, anonKey: 'test-only', path: 'editions/owner/1-issue.pdf', contentType: 'application/pdf', token: vi.fn(async () => 'valid'), onStatus: vi.fn() };
}
const hash = (value: Blob | Buffer) => createHash('sha256').update(value as Buffer).digest('hex');

describe('real resumable HTTP transfers', () => {
  it('finishes a 42 MB PDF after a lost chunk response without retransmitting saved bytes', async () => {
    const file = input(42 * 1024 * 1024); const settings = options(); dropResponse = true;
    await uploadResumable(file, settings);
    expect(offset).toBe(file.size); expect(largestChunk).toBeLessThanOrEqual(UPLOAD_CHUNK_BYTES);
    expect(creates).toBe(1); expect(heads).toBeGreaterThan(0);
    expect(offsets[1]).toBe(2 * UPLOAD_CHUNK_BYTES);
    expect(hash(Buffer.concat(parts))).toBe(hash(file));
    expect(settings.onStatus).toHaveBeenCalledWith(expect.stringMatching(/Retrying/));
    expect(savedUrls.size).toBe(0);
  });
  it('continues a manually paused upload with the original upload URL', async () => {
    const file = input(13 * 1024 * 1024); const controller = new AbortController();
    const settings = options(); let requests = 0;
    settings.token.mockImplementation(async () => { if (++requests === 2) controller.abort(); return 'valid'; });
    await expect(uploadResumable(file, { ...settings, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(offset).toBe(UPLOAD_CHUNK_BYTES);
    expect(savedUrls.size).toBe(1);
    const retry = options(); await uploadResumable(file, retry);
    expect(creates).toBe(1); expect(offsets[0]).toBe(UPLOAD_CHUNK_BYTES);
    expect(hash(Buffer.concat(parts))).toBe(hash(file));
    expect(retry.onStatus).toHaveBeenCalledWith(expect.stringMatching(/Resuming/));
  });
  it('refreshes an expired login token before retrying', async () => {
    const file = input(7 * 1024 * 1024); const settings = options(); rejectExpiredToken = true;
    let token = 'expired';
    settings.token.mockImplementation(async (refresh?: boolean) => { if (refresh) token = 'valid'; return token; });
    await uploadResumable(file, settings);
    expect(settings.token).toHaveBeenCalledWith(true);
    expect(hash(Buffer.concat(parts))).toBe(hash(file));
  });
});
