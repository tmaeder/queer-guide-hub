import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import { useSecureCredentials } from '../useSecureCredentials';

describe('useSecureCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should start loading', () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useSecureCredentials());
    expect(result.current.loading).toBe(true);
  });

  it('should load stripe key from edge function', async () => {
    mockInvoke.mockResolvedValue({ data: { publishable_key: 'pk_test_123' }, error: null });
    const { result } = renderHook(() => useSecureCredentials());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.credentials.stripePublishableKey).toBe('pk_test_123');
  });

  it('should handle fetch failure gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useSecureCredentials());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.credentials.stripePublishableKey).toBeUndefined();
  });

  it('should allow setting temporary credential with pk_ prefix', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useSecureCredentials());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setTemporaryCredential('stripePublishableKey', 'pk_live_abc'); });
    expect(result.current.credentials.stripePublishableKey).toBe('pk_live_abc');
  });

  it('should reject non-pk_ values', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useSecureCredentials());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setTemporaryCredential('stripePublishableKey', 'sk_secret'); });
    expect(result.current.credentials.stripePublishableKey).toBeUndefined();
  });

  it('should clear credentials and localStorage', async () => {
    localStorage.setItem('STRIPE_PUBLISHABLE_KEY', 'old');
    mockInvoke.mockResolvedValue({ data: { publishable_key: 'pk_test' }, error: null });
    const { result } = renderHook(() => useSecureCredentials());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.clearCredentials(); });
    expect(result.current.credentials.stripePublishableKey).toBeUndefined();
    expect(localStorage.getItem('STRIPE_PUBLISHABLE_KEY')).toBeNull();
  });
});
