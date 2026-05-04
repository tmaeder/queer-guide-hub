import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SafeModeProvider, useSafeMode } from '@/providers/SafeModeProvider';

const KEY = 'qg_safe_mode';

const wrap = ({ children }: { children: ReactNode }) => (
  <SafeModeProvider>{children}</SafeModeProvider>
);

describe('SafeModeProvider (P0-3)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to "on" for new visitors', () => {
    const { result } = renderHook(() => useSafeMode(), { wrapper: wrap });
    expect(result.current.mode).toBe('on');
    expect(result.current.enabled).toBe(true);
  });

  it('honors a stored "off" preference', () => {
    localStorage.setItem(KEY, 'off');
    const { result } = renderHook(() => useSafeMode(), { wrapper: wrap });
    expect(result.current.mode).toBe('off');
  });

  it('toggle() flips and persists', () => {
    const { result } = renderHook(() => useSafeMode(), { wrapper: wrap });
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('off');
    expect(localStorage.getItem(KEY)).toBe('off');
    act(() => result.current.toggle());
    expect(result.current.mode).toBe('on');
    expect(localStorage.getItem(KEY)).toBe('on');
  });

  it('isAdultCategory matches Sex & Kink parents and leaves', () => {
    const { result } = renderHook(() => useSafeMode(), { wrapper: wrap });
    expect(result.current.isAdultCategory('Sexuality & Kink')).toBe(true);
    expect(result.current.isAdultCategory('BDSM & Power Exchange')).toBe(true);
    expect(result.current.isAdultCategory('Fetishes & Interests')).toBe(true);
    expect(result.current.isAdultCategory('Identity & Expression')).toBe(false);
    expect(result.current.isAdultCategory(null)).toBe(false);
  });

  it('shouldHide returns true for adult categories when enabled, false when disabled', () => {
    const { result } = renderHook(() => useSafeMode(), { wrapper: wrap });
    expect(result.current.shouldHide(['BDSM & Power Exchange', 'Sexuality & Kink'])).toBe(true);
    expect(result.current.shouldHide(['Identity & Expression'])).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.shouldHide(['BDSM & Power Exchange'])).toBe(false);
  });
});
