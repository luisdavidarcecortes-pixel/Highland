import { describe, expect, it } from 'vitest';
import { clampPage, initialReaderPage, visiblePageRange } from '../src/components/flipbook/reader-state';

describe('reader positions and spreads', () => {
  it('respects an explicit first page over a remembered later page', () => {
    expect(initialReaderPage('?page=1', '8')).toBe(1);
    expect(initialReaderPage('', '8')).toBe(8);
  });
  it('rejects partial numbers and unsafe page values', () => {
    for (const query of ['?page=2oops', '?page=2.5', '?page=-1', '?page=Infinity', '?page=999999999999999999']) expect(initialReaderPage(query, '4')).toBe(4);
    expect(clampPage(999, 1)).toBe(1);
    expect(clampPage(NaN, 12)).toBe(1);
  });
  it('shows the cover alone and both pages of an inside spread', () => {
    expect(visiblePageRange(1, 12, false)).toEqual({ first: 1, last: 1 });
    expect(visiblePageRange(7, 12, false)).toEqual({ first: 6, last: 7 });
    expect(visiblePageRange(7, 12, true)).toEqual({ first: 7, last: 7 });
  });
  it('recognizes the last spread in issues with an odd number of pages', () => {
    expect(visiblePageRange(10, 11, false)).toEqual({ first: 10, last: 11 });
    expect(visiblePageRange(12, 12, false)).toEqual({ first: 12, last: 12 });
  });
});
