/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUndoRedo } from '../useUndoRedo';

describe('useUndoRedo', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useUndoRedo([], [], vi.fn(), vi.fn()));
    expect(result.current).toBeDefined();
  });
});
