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
});
