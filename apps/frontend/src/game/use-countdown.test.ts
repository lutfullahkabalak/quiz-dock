import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetClock } from './clock';
import { useCountdown } from './use-countdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetClock();
  });
  afterEach(() => vi.useRealTimers());

  it('counts down to the server deadline, then stops ticking (audit F6)', () => {
    const endsAt = Date.now() + 2_000;
    const { result } = renderHook(() => useCountdown(endsAt));
    const tick = (ms: number) => {
      for (let t = 0; t < ms; t += 250) act(() => void vi.advanceTimersByTime(250));
    };
    expect(result.current).toBe(2);
    tick(1_000);
    expect(result.current).toBe(1);
    tick(1_500);
    // Past the deadline nothing changes on screen: no timer left to re-render the page.
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current).toBe(0);
  });
});
