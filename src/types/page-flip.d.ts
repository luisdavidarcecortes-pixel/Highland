declare module 'page-flip' {
  export interface FlipEvent {
    data: number;
    object: unknown;
  }

  export interface PageFlipOptions {
    [key: string]: unknown;
  }

  export class PageFlip {
    constructor(element: HTMLElement, options: PageFlipOptions);
    loadFromHTML(items: HTMLElement[]): void;
    updateFromHtml(items: HTMLElement[]): void;
    flipNext(): void;
    flipPrev(): void;
    turnToPage(page: number): void;
    on(event: string, cb: (e: FlipEvent) => void): void;
    off(event: string): void;
    destroy(): void;
  }
}
