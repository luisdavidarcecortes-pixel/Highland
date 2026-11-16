import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadHttpStack } from '../src/lib/upload-http-stack';
import type { HttpResponse, HttpStack } from 'tus-js-client';

afterEach(() => vi.useRealTimers());
function mockStack() {
  let progress = (_bytes: number) => {};
  let complete: (response: HttpResponse) => void = () => {};
  const abort = vi.fn(async () => {});
  const base = { getName: () => 'Test', createRequest: () => ({
    getMethod: () => 'PATCH', getURL: () => 'https://storage.test/upload',
    getHeader: () => undefined, setHeader: () => {}, getUnderlyingObject: () => ({}),
    setProgressHandler: (handler: (bytes: number) => void) => { progress = handler; },
    send: () => new Promise<HttpResponse>(resolve => { complete = resolve; }), abort,
  }) } satisfies HttpStack;
  return { base, abort, progress: (bytes: number) => progress(bytes), complete: () => complete({ getStatus: () => 204 } as HttpResponse) };
}
describe('upload inactivity deadline', () => {
  it('allows transfers longer than five minutes when bytes keep moving', async () => {
    vi.useFakeTimers();
    const mock = mockStack(); const request = new UploadHttpStack(mock.base).createRequest('PATCH', '/upload');
    request.setProgressHandler(() => {});
    const result = request.send(null);
    await Promise.resolve();
    for (let second = 0; second < 600; second += 60) {
      await vi.advanceTimersByTimeAsync(60000); mock.progress(second + 1);
    }
    expect(mock.abort).not.toHaveBeenCalled();
    mock.complete(); expect((await result).getStatus()).toBe(204);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts a stalled request so TUS can retry from the saved offset', async () => {
    vi.useFakeTimers(); const mock = mockStack();
    const request = new UploadHttpStack(mock.base, 100).createRequest('PATCH', '/upload');
    const result = expect(request.send(null)).rejects.toThrow(/stopped making progress/);
    await vi.advanceTimersByTimeAsync(101); await result;
    expect(mock.abort).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('settles a paused request and clears its deadline', async () => {
    vi.useFakeTimers(); const mock = mockStack();
    const request = new UploadHttpStack(mock.base).createRequest('PATCH', '/upload');
    const result = expect(request.send(null)).rejects.toMatchObject({ name: 'AbortError' });
    await request.abort(); await result; expect(vi.getTimerCount()).toBe(0);
  });
});
