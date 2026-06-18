/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useHaptics', () => ({ hapticTrigger: vi.fn() }));

const { sonnerToast } = vi.hoisted(() => {
  const fn = vi.fn(() => 'id-1') as ReturnType<typeof vi.fn> & {
    error: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  fn.error = vi.fn(() => 'id-err');
  fn.dismiss = vi.fn();
  return { sonnerToast: fn };
});
vi.mock('sonner', () => ({ toast: sonnerToast }));

import { useToast, toast } from '../use-toast';

describe('use-toast (sonner shim)', () => {
  beforeEach(() => {
    sonnerToast.mockClear();
    sonnerToast.error.mockClear();
    sonnerToast.dismiss.mockClear();
  });

  it('toast() returns id, dismiss, update', () => {
    const t = toast({ title: 'Hi' });
    expect(t.id).toBeDefined();
    expect(typeof t.dismiss).toBe('function');
    expect(typeof t.update).toBe('function');
  });

  it('default variant routes to sonnerToast()', () => {
    toast({ title: 'Saved', description: 'All good' });
    expect(sonnerToast).toHaveBeenCalledWith('Saved', expect.objectContaining({ description: 'All good' }));
    expect(sonnerToast.error).not.toHaveBeenCalled();
  });

  it('destructive variant routes to sonnerToast.error()', () => {
    toast({ title: 'Nope', variant: 'destructive' });
    expect(sonnerToast.error).toHaveBeenCalledWith('Nope', expect.any(Object));
  });

  it('description-only toast is not duplicated', () => {
    toast({ description: 'Just a note' });
    expect(sonnerToast).toHaveBeenCalledWith('Just a note', expect.not.objectContaining({ description: 'Just a note' }));
  });

  it('useToast exposes toasts (empty) and dismiss', () => {
    const { result } = renderHook(() => useToast());
    expect(Array.isArray(result.current.toasts)).toBe(true);
    expect(typeof result.current.dismiss).toBe('function');
  });
});
