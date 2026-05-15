/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { useAuthMock, useToastMock, useTranslationMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    useAuthMock: vi.fn(),
    useToastMock: vi.fn(),
    useTranslationMock: vi.fn(),
    toastFn,
  };
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('react-i18next', () => ({ useTranslation: useTranslationMock }));

import { useRequireVerifiedEmail } from '../useRequireVerifiedEmail';

beforeEach(() => {
  useAuthMock.mockReset();
  useToastMock.mockReset();
  useTranslationMock.mockReset();
  toastFn.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
  useTranslationMock.mockReturnValue({ t: (_key: string, fallback: string) => fallback });
});

describe('useRequireVerifiedEmail', () => {
  it('returns false and toasts "Sign in required" when no user', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useRequireVerifiedEmail());

    expect(result.current()).toBe(false);
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sign in required', variant: 'destructive' }),
    );
  });

  it('returns false and toasts "Verify your email first" when email is unconfirmed', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email_confirmed_at: null },
    });
    const { result } = renderHook(() => useRequireVerifiedEmail());

    expect(result.current()).toBe(false);
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Verify your email first', variant: 'destructive' }),
    );
  });

  it('returns true when email is confirmed', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email_confirmed_at: '2026-01-01T00:00:00Z' },
    });
    const { result } = renderHook(() => useRequireVerifiedEmail());

    expect(result.current()).toBe(true);
    expect(toastFn).not.toHaveBeenCalled();
  });
});
