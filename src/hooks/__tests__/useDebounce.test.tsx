import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce, useThrottle } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('b');
  });

  it('should reset timer on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'c' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('c');
  });
});

describe('useThrottle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should return initial value', () => {
    const { result } = renderHook(() => useThrottle('x', 500));
    expect(result.current).toBe('x');
  });

  it('should update value on interval tick', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 500),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('b');
  });
});
