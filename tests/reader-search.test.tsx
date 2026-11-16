// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SearchPanel } from '../src/components/flipbook/toolbar';

afterEach(cleanup);
const handlers = { onQueryChange: () => {}, onClose: () => {}, onGo: () => {} };
it('keeps matching pages beyond the first twenty reachable in search', () => {
  render(<SearchPanel {...handlers} query="Campus" results={Array.from({ length: 30 }, (_, i) => ({ page: i + 1, snippet: 'Campus news' }))} />);
  expect(screen.getByRole('button', { name: /p\.30\s*Campus news/ })).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(31);
});
it('does not report no results while the remaining page text is still loading', () => {
  render(<SearchPanel {...handlers} query="Campus" results={[]} pending />);
  expect(screen.queryByText('No results.')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('remaining pages load');
});
