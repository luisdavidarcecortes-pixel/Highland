// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Flipbook } from '../src/components/flipbook/flipbook';

const state = vi.hoisted(() => ({ next: vi.fn(), prev: vi.fn(), turn: vi.fn(), auto: { enabled: false, tick: () => {} }, count: 11 }));
const pages = Array.from({ length: 11 }, (_, i) => `page-${i + 1}`);
const doc = { numPages: 11 };
vi.mock('../src/lib/use-pdf-doc', () => ({ usePdfDoc: () => ({ doc, loading: false, error: null, progress: 1, retry: vi.fn() }) }));
vi.mock('../src/components/flipbook/use-pdf-pages', () => ({ usePdfPages: () => ({ pages: pages.slice(0, state.count), texts: Array(state.count).fill('Campus news'), aspect: 0.75, error: null, ready: true, numPages: state.count, completed: state.count, failedPages: [], retry: vi.fn() }) }));
vi.mock('../src/components/flipbook/use-size', () => ({ useElementSize: () => ({ w: 1100, h: 650 }) }));
vi.mock('../src/components/flipbook/use-prepared-pages', () => ({ usePreparedPages: () => ({ failed: true }) }));
vi.mock('../src/components/slow-video', () => ({ SlowVideo: () => null }));
vi.mock('../src/components/flipbook/use-auto-flip', () => ({ useAutoFlip: (enabled: boolean, _interval: number, tick: () => void) => { state.auto = { enabled, tick }; } }));
vi.mock('react-pageflip', async () => {
  const React = await import('react');
  return { default: React.forwardRef((props: any, ref) => {
    const latest = React.useRef(props); latest.current = props;
    React.useImperativeHandle(ref, () => ({ pageFlip: () => ({
      turnToPage: (n: number) => { state.turn(n); latest.current.onFlip({ data: n }); },
      flipPrev: state.prev, flipNext: state.next, destroy: () => {},
    }) }), []);
    React.useEffect(() => props.onInit(), []);
    return <div data-testid="book">{props.children}</div>;
  }) };
});

beforeEach(() => {
  state.count = 11; vi.clearAllMocks(); localStorage.clear();
  window.history.replaceState({ nextMarker: true }, '', '/read?page=1');
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(cb, 0));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  window.matchMedia ??= vi.fn(() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, media: '', onchange: null }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('reader control regressions', () => {
  it('leaves browser shortcuts alone and stops page arrows from scrolling the website', () => {
    render(<Flipbook pdfUrl="issue.pdf" title="Issue" editionId="edition" />);
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    fireEvent(document.body, event);
    expect(state.next).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(window.history.state).toEqual({ nextMarker: true });
  });
  it('does not advance behind search and pauses manual touch navigation', () => {
    render(<Flipbook pdfUrl="issue.pdf" title="Issue" />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-play', exact: true }));
    expect(state.auto.enabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
    expect(state.auto.enabled).toBe(false);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    fireEvent.pointerDown(screen.getByTestId('book'));
    expect(state.auto.enabled).toBe(false);
  });
  it('pauses the play toggle once, including its pointer event', () => {
    render(<Flipbook pdfUrl="issue.pdf" title="Issue" />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-play', exact: true }));
    const pause = screen.getByRole('button', { name: 'Pause auto-play', exact: true });
    fireEvent.pointerDown(pause); fireEvent.click(pause);
    expect(state.auto.enabled).toBe(false);
  });
  it('loops at the final two-page spread of an odd-length issue', async () => {
    window.history.replaceState(null, '', '/read?page=10');
    render(<Flipbook pdfUrl="issue.pdf" title="Issue" />);
    await waitFor(() => expect(state.turn).toHaveBeenCalledWith(9));
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-play', exact: true }));
    act(() => state.auto.tick());
    expect(state.turn).toHaveBeenLastCalledWith(0);
    expect(state.next).not.toHaveBeenCalled();
  });
  it('clamps an obsolete saved position even for a one-page issue', async () => {
    state.count = 1;
    localStorage.setItem('highlander:lastpage:edition', '999');
    window.history.replaceState(null, '', '/read');
    render(<Flipbook pdfUrl="issue.pdf" title="Issue" editionId="edition" />);
    await waitFor(() => expect(localStorage.getItem('highlander:lastpage:edition')).toBe('1'));
    expect(document.querySelector('summary')?.textContent).toBe('Read page 1 as text');
  });
});
