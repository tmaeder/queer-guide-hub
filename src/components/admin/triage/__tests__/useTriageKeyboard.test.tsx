/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTriageKeyboard } from '../useTriageKeyboard';

describe('useTriageKeyboard', () => {
  it('runs without throwing', () => {
    const { result } = renderHook(() =>
      useTriageKeyboard({
        items: [],
        activeId: null,
        onNavigate: vi.fn(),
        onApprove: vi.fn(),
        onReject: vi.fn(),
        onSkip: vi.fn(),
        onFlag: vi.fn(),
        onToggleCheck: vi.fn(),
      } as never),
    );
    expect(result.current === undefined || typeof result.current === 'object').toBe(true);
  });

  it('maps U to onUndo and A to onApprove', () => {
    const onUndo = vi.fn();
    const onApprove = vi.fn();
    renderHook(() =>
      useTriageKeyboard({
        items: [{ id: 'x' }],
        activeId: 'x',
        onNavigate: vi.fn(),
        onApprove,
        onReject: vi.fn(),
        onSkip: vi.fn(),
        onFlag: vi.fn(),
        onToggleCheck: vi.fn(),
        onUndo,
        enabled: true,
      }),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u' }));
    expect(onUndo).toHaveBeenCalledOnce();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(onApprove).toHaveBeenCalledOnce();
  });
});
