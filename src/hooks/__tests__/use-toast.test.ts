/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/hooks/useHaptics', () => ({ hapticTrigger: vi.fn() }));

import { useToast, toast, reducer } from '../use-toast';

describe('use-toast', () => {
  it('toast() returns id, dismiss, update', () => {
    const t = toast({ title: 'Hi' });
    expect(t.id).toBeDefined();
    expect(typeof t.dismiss).toBe('function');
    expect(typeof t.update).toBe('function');
  });
  it('useToast exposes toasts and dismiss', () => {
    const { result } = renderHook(() => useToast());
    expect(Array.isArray(result.current.toasts)).toBe(true);
    expect(typeof result.current.dismiss).toBe('function');
  });
  it('reducer handles ADD_TOAST', () => {
    const next = reducer({ toasts: [] }, { type: 'ADD_TOAST', toast: { id: '1', open: true } } as never);
    expect(next.toasts.length).toBe(1);
  });
  it('reducer handles DISMISS_TOAST', () => {
    const state = { toasts: [{ id: '1', open: true } as never] };
    act(() => {
      const next = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' } as never);
      expect(next.toasts[0].open).toBe(false);
    });
  });
});
