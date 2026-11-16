import type { HttpStack, HttpRequest, HttpResponse } from 'tus-js-client';

/** Retry a stalled request, while allowing a slow request to keep progressing. */
export class UploadHttpStack implements HttpStack {
  constructor(private base: HttpStack, private idleMilliseconds = 120000) {}
  getName() { return `IdleBounded${this.base.getName()}`; }
  createRequest(method: string, url: string): HttpRequest {
    const request = this.base.createRequest(method, url);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interrupt: ((error: Error) => void) | undefined;
    const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const touch = () => {
      clear();
      if (!interrupt) return;
      timer = setTimeout(() => {
        interrupt?.(new Error('The connection stopped making progress.'));
        void request.abort().catch(() => {});
      }, this.idleMilliseconds);
    };
    return {
      getMethod: () => request.getMethod(),
      getURL: () => request.getURL(),
      getHeader: name => request.getHeader(name),
      setHeader: (name, value) => request.setHeader(name, value),
      getUnderlyingObject: () => request.getUnderlyingObject(),
      setProgressHandler: handler => request.setProgressHandler(bytes => { touch(); handler(bytes); }),
      send: body => new Promise<HttpResponse>((resolve, reject) => {
        const finish = (error?: Error, response?: HttpResponse) => {
          if (!interrupt) return;
          interrupt = undefined; clear();
          if (error) reject(error); else resolve(response!);
        };
        interrupt = error => finish(error);
        touch();
        Promise.resolve().then(() => {
          if (!interrupt) throw new DOMException('The upload was paused.', 'AbortError');
          return request.send(body);
        }).then(response => finish(undefined, response), error => finish(error));
      }),
      abort: async () => {
        interrupt?.(new DOMException('The upload was paused.', 'AbortError'));
        clear();
        await request.abort();
      },
    };
  }
}
