// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MagazinePreload } from '../src/components/magazine-preload';

const state = vi.hoisted(() => ({ path: '/', preload: vi.fn(async () => {}) }));
vi.mock('next/navigation', () => ({ usePathname: () => state.path }));
vi.mock('../src/lib/reader-preload', () => ({ preloadMagazine: state.preload }));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('does not download the whole issue for visitors who never open the reader', () => {
  state.path = '/';
  render(<MagazinePreload />);
  vi.advanceTimersByTime(2000);
  expect(state.preload).not.toHaveBeenCalled();
});

it('does not warm the magazine on the archive or the news', () => {
  state.path = '/archive';
  render(<MagazinePreload />);
  vi.advanceTimersByTime(2000);
  expect(state.preload).not.toHaveBeenCalled();
});

it('prepares the selected archive issue when entering its reading URL', () => {
  state.path = '/read/selected-edition';
  render(<MagazinePreload />);
  vi.advanceTimersByTime(2000);
  expect(state.preload).toHaveBeenCalledWith('selected-edition');
});

it('prepares the latest issue on the reader index', () => {
  state.path = '/read';
  render(<MagazinePreload />);
  vi.advanceTimersByTime(2000);
  expect(state.preload).toHaveBeenCalledWith('latest');
});

it('does not make the admin or password setup download a public magazine', () => {
  state.path = '/admin';
  const result = render(<MagazinePreload />);
  state.path = '/set-password';
  result.rerender(<MagazinePreload />);
  vi.advanceTimersByTime(2000);
  expect(state.preload).not.toHaveBeenCalled();
});
