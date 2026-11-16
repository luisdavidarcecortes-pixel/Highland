// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAutoFlip } from '../src/components/flipbook/use-auto-flip';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('does not turn pages in a hidden tab and restarts with a full reading interval', () => {
  vi.useFakeTimers(); let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const tick = vi.fn();
  renderHook(() => useAutoFlip(true, 9000, tick));
  act(() => vi.advanceTimersByTime(9000));
  expect(tick).toHaveBeenCalledTimes(1);
  act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); vi.advanceTimersByTime(27000); });
  expect(tick).toHaveBeenCalledTimes(1);
  act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); vi.advanceTimersByTime(8999); });
  expect(tick).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(1));
  expect(tick).toHaveBeenCalledTimes(2);
});
