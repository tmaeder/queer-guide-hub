import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsMobile } from '../use-mobile';

describe('useIsMobile', () => {
  it('should return a boolean', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe('boolean');
  });

  it('should return false in jsdom (1024px default)', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
