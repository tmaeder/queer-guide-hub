import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      resend: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { all: [] } }),
      },
    },
    functions: { invoke: vi.fn() },
  },
}));

import { AuthProvider, useAuth } from '../useAuth';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

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
});
