/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollDirection } from '../useScrollDirection';

function setScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

describe('useScrollDirection', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    // Run rAF synchronously so the throttled update applies within act().
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it('starts as up', () => {
    const { result } = renderHook(() => useScrollDirection());
    expect(result.current).toBe('up');
  });

  it('reports down when scrolling down past the top offset', () => {
    const { result } = renderHook(() => useScrollDirection({ topOffset: 80 }));
    setScroll(200);
    expect(result.current).toBe('down');
  });

  it('reports up again when scrolling back up', () => {
    const { result } = renderHook(() => useScrollDirection({ topOffset: 80 }));
    setScroll(300);
    expect(result.current).toBe('down');
    setScroll(150);
    expect(result.current).toBe('up');
  });

  it('forces up near the top regardless of direction', () => {
    const { result } = renderHook(() => useScrollDirection({ topOffset: 80 }));
    setScroll(300);
    expect(result.current).toBe('down');
    setScroll(20);
    expect(result.current).toBe('up');
  });
});
