import { describe, it, expect, vi } from 'vitest';

vi.mock('motion/react', () => ({
  useReducedMotion: vi.fn(() => null),
}));

import { renderHook } from '@testing-library/react';
import { useReducedMotion } from '../useReducedMotion';

describe('useReducedMotion', () => {
  it('should return false when motion returns null', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('should return true when motion returns true', async () => {
    const motion = await import('motion/react');
    vi.mocked(motion.useReducedMotion).mockReturnValue(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });
});
