import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/** Captured so tests can drive auth events the way GoTrue would. */
let authCallback: ((event: string, session: unknown) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      resend: vi.fn(),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { all: [] } }),
      },
    },
    functions: { invoke: vi.fn() },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

import { AuthProvider, useAuth } from '../useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  authCallback = null;
  try {
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('useAuth', () => {
  it('should throw when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    );
  });

  it('should return auth context shape', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('session');
    expect(result.current).toHaveProperty('loading');
    expect(typeof result.current.signUp).toBe('function');
    expect(typeof result.current.signIn).toBe('function');
    expect(typeof result.current.signOut).toBe('function');
    expect(typeof result.current.signInWithOAuth).toBe('function');
    expect(typeof result.current.resendVerification).toBe('function');
    expect(typeof result.current.resetPassword).toBe('function');
    expect(typeof result.current.enrollPasskey).toBe('function');
    expect(typeof result.current.signInWithPasskey).toBe('function');
  });

  it('should start with null user', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it('should have hasPasskey boolean', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(typeof result.current.hasPasskey).toBe('boolean');
  });

  it('exposes passwordRecovery and updatePassword', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.passwordRecovery).toBe(false);
    expect(typeof result.current.updatePassword).toBe('function');
  });
});

describe('useAuth — password recovery', () => {
  it('sets the flag on PASSWORD_RECOVERY', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.passwordRecovery).toBe(false);

    act(() => authCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } }));

    await waitFor(() => expect(result.current.passwordRecovery).toBe(true));
  });

  it('does NOT set the flag on an ordinary SIGNED_IN', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => authCallback?.('SIGNED_IN', { user: { id: 'u1' } }));
    await waitFor(() => expect(result.current.user).toBeTruthy());
    expect(result.current.passwordRecovery).toBe(false);
  });

  it('clears the flag on SIGNED_OUT', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => authCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
    await waitFor(() => expect(result.current.passwordRecovery).toBe(true));

    act(() => authCallback?.('SIGNED_OUT', null));
    await waitFor(() => expect(result.current.passwordRecovery).toBe(false));
  });

  it('clears the flag after a successful updatePassword', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => authCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
    await waitFor(() => expect(result.current.passwordRecovery).toBe(true));

    await act(async () => {
      await result.current.updatePassword('correcthorsebattery');
    });

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'correcthorsebattery' });
    await waitFor(() => expect(result.current.passwordRecovery).toBe(false));
  });

  it('keeps the flag set when updatePassword fails', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
      error: { message: 'expired' },
    } as never);
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => authCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
    await waitFor(() => expect(result.current.passwordRecovery).toBe(true));

    await act(async () => {
      await result.current.updatePassword('correcthorsebattery');
    });

    expect(result.current.passwordRecovery).toBe(true);
  });

  it('survives PASSWORD_RECOVERY arriving before INITIAL_SESSION', async () => {
    // auth-js emits INITIAL_SESSION per-subscriber at registration and
    // PASSWORD_RECOVERY from the URL exchange; which lands first is a race.
    // Recovery must win in BOTH orders — this is the order where a naive
    // "INITIAL_SESSION clears the flag" would wrongly cancel a real reset.
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => authCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
    act(() => authCallback?.('INITIAL_SESSION', { user: { id: 'u1' } }));

    await waitFor(() => expect(result.current.passwordRecovery).toBe(true));
  });

  it('survives INITIAL_SESSION arriving before PASSWORD_RECOVERY', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => authCallback?.('INITIAL_SESSION', { user: { id: 'u1' } }));
    act(() => authCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } }));

    await waitFor(() => expect(result.current.passwordRecovery).toBe(true));
  });

  it('sends the reset email to the allowlisted recovery URL', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.resetPassword('a@b.com');
    });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'a@b.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth?reset=1') }),
    );
  });
});

/**
 * log_security_event calls recorded on the supabase.rpc mock.
 *
 * Read through a narrow local type rather than vi.mocked(supabase.rpc): the
 * real signature is generic over every RPC name in the generated types, and
 * instantiating it here trips TS2589 ("excessively deep").
 */
function securityLogCalls(): unknown[][] {
  const rpc = supabase.rpc as unknown as { mock: { calls: unknown[][] } };
  return rpc.mock.calls.filter((c) => c[0] === 'log_security_event');
}

describe('useAuth — security logging', () => {
  it('never records the email on a failed sign-in', async () => {
    // The row is written for a caller who has just proved nothing, so the
    // address may not be theirs. Regression guard: it used to be logged.
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signIn('victim@example.com', 'wrong');
    });

    const logCalls = securityLogCalls();
    expect(logCalls.length).toBeGreaterThan(0);
    for (const call of logCalls) {
      expect(JSON.stringify(call[1])).not.toContain('victim@example.com');
    }
  });

  it('never records the email on a successful sign-in', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    } as never);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signIn('victim@example.com', 'right');
    });

    const logCalls = securityLogCalls();
    expect(logCalls.length).toBeGreaterThan(0);
    for (const call of logCalls) {
      expect(JSON.stringify(call[1])).not.toContain('victim@example.com');
    }
  });
});
