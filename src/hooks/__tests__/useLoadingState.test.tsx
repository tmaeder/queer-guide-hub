import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadingState } from '../useLoadingState';

describe('useLoadingState', () => {
  it('should start with default state', () => {
    const { result } = renderHook(() => useLoadingState());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should accept initialLoading option', () => {
    const { result } = renderHook(() => useLoadingState({ initialLoading: true }));
    expect(result.current.loading).toBe(true);
  });

  it('should set loading state', () => {
    const { result } = renderHook(() => useLoadingState());
    act(() => { result.current.setLoading(true); });
    expect(result.current.loading).toBe(true);
  });

  it('should clear error when loading starts', () => {
    const { result } = renderHook(() => useLoadingState());
    act(() => { result.current.setError('oops'); });
    act(() => { result.current.setLoading(true); });
    expect(result.current.error).toBeNull();
  });

  it('should set error and stop loading', () => {
    const { result } = renderHook(() => useLoadingState());
    act(() => { result.current.setLoading(true); });
    act(() => { result.current.setError('fail'); });
    expect(result.current.error).toBe('fail');
    expect(result.current.loading).toBe(false);
  });

  it('should reset to initial state', () => {
    const { result } = renderHook(() => useLoadingState());
    act(() => { result.current.setError('error'); });
    act(() => { result.current.reset(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should wrap async function with loading states on success', async () => {
    const { result } = renderHook(() => useLoadingState());
    let resolved: string | null = null;
    await act(async () => {
      resolved = await result.current.withLoading(() => Promise.resolve('ok'));
    });
    expect(resolved).toBe('ok');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should set error on async failure', async () => {
    const { result } = renderHook(() => useLoadingState());
    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.withLoading(() => Promise.reject(new Error('boom')));
    });
    expect(resolved).toBeNull();
    expect(result.current.error).toBe('boom');
    expect(result.current.loading).toBe(false);
  });
});
