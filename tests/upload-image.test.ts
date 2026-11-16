import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), cleanup: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/auth', () => ({ getSessionUser: mocks.user, SessionAccessError: class extends Error {} }));
vi.mock('../src/lib/supabase-server', () => ({
  getSupabaseServerClient: mocks.client,
  getSupabaseAdminClient: vi.fn(),
}));
vi.mock('../src/lib/storage-cleanup', () => ({ cleanupObjects: mocks.cleanup }));
import { POST as uploadImage } from '../src/app/api/upload-image/route';

const userId = '11111111-1111-4111-8111-111111111111';
const uploads: { path: string; body: Buffer; contentType: string }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  uploads.length = 0;
  mocks.user.mockResolvedValue({ id: userId, role: 'editor', aal: 'aal1', email: 'editor@example.test', fullName: 'Editor' });
  mocks.client.mockResolvedValue({
    storage: {
      from: () => ({
        upload: async (path: string, body: Buffer, options: { contentType: string }) => {
          uploads.push({ path, body, contentType: options.contentType });
          return { error: null };
        },
      }),
    },
  });
});

function imageRequest(bytes: Buffer, name: string, type: string) {
  const form = new FormData();
  form.append('image', new File([bytes], name, { type }));
  return new NextRequest('https://paper.example/api/upload-image', { method: 'POST', body: form });
}

describe('news photos are prepared before they are stored', () => {
  it('scales a big picture down and stores it as WebP', async () => {
    const png = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: '#ff0000' },
    }).png().toBuffer();

    const response = await uploadImage(imageRequest(png, 'photo.png', 'image/png'));

    expect(response.status).toBe(201);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].contentType).toBe('image/webp');
    expect(uploads[0].path.startsWith(`articles/${userId}/`)).toBe(true);
    const meta = await sharp(uploads[0].body).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.format).toBe('webp');
  });

  it('rejects a file that is not a picture, whatever it claims to be', async () => {
    const response = await uploadImage(
      imageRequest(Buffer.from('<script>alert(1)</script>'), 'evil.png', 'image/png'),
    );
    expect(response.status).toBe(400);
    expect(uploads).toHaveLength(0);
  });

  it('rejects a format that is not allowed', async () => {
    const response = await uploadImage(imageRequest(Buffer.from('x'), 'note.pdf', 'application/pdf'));
    expect(response.status).toBe(400);
    expect(uploads).toHaveLength(0);
  });
});
