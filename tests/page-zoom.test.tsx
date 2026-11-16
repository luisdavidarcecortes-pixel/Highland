// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PageZoom } from '../src/components/flipbook/page-zoom';
import { renderPdfPage } from '../src/components/flipbook/pdf-render';

vi.mock('../src/components/flipbook/pdf-render', () => ({ renderPdfPage: vi.fn() }));
const doc = {} as PDFDocumentProxy;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
  vi.stubGlobal('URL', class extends URL { static revokeObjectURL = vi.fn(); });
  vi.mocked(renderPdfPage).mockResolvedValue({ url: 'blob:sharp', text: '' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('readable page zoom', () => {
  it('zooms an already prepared page without loading or converting its PDF again', async () => {
    render(<PageZoom doc={null} page={2} preview="/prepared/2" aspect={0.75} onClose={() => {}} />);
    expect(renderPdfPage).not.toHaveBeenCalled();
    expect(screen.getByRole('img').getAttribute('src')).toBe('/prepared/2');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeTruthy();
  });
  it('fits the whole page initially and creates scrollable dimensions when enlarged', async () => {
    render(<PageZoom doc={doc} page={2} preview="preview" aspect={0.75} onClose={() => {}} />);
    const img = await screen.findByRole('img', { name: 'Page 2 zoomed' });
    await waitFor(() => expect(img.getAttribute('src')).toBe('blob:sharp'));
    expect(img.style.width).toBe('507px');
    expect(img.style.height).toBe('676px');
    fireEvent.doubleClick(img);
    expect(img.style.width).toBe('1014px');
    expect(img.parentElement!.style.width).toBe('1014px');
    expect(img.parentElement!.style.minHeight).toBe('1352px');
    fireEvent.click(screen.getByRole('button', { name: 'Fit page' }));
    expect(img.style.height).toBe('676px');
  });
  it('aborts work on close and releases a late image without replacing a new dialog', async () => {
    let resolve: (value: any) => void = () => {};
    vi.mocked(renderPdfPage).mockImplementation(() => new Promise(res => { resolve = res; }));
    const { unmount } = render(<PageZoom doc={doc} page={2} preview="preview" aspect={0.75} onClose={() => {}} />);
    const signal = vi.mocked(renderPdfPage).mock.calls[0][2]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ url: 'blob:late', text: '' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  });
  it('keeps the preview usable when high-resolution rendering fails', async () => {
    vi.mocked(renderPdfPage).mockResolvedValue(null);
    const close = vi.fn();
    render(<PageZoom doc={doc} page={2} preview="preview" aspect={0.75} onClose={close} />);
    await screen.findByText(/Showing the page preview/);
    expect(screen.getByRole('img').getAttribute('src')).toBe('preview');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
});
