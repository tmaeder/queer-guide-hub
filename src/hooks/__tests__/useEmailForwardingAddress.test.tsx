/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { rpcMock, useAuthMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useEmailForwardingAddress,
  useRotateEmailForwardingAddress,
} from '../useEmailForwardingAddress';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpcMock.mockReset();
  useAuthMock.mockReset();
});

describe('useEmailForwardingAddress', () => {
  it('is disabled when no user is signed in', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useEmailForwardingAddress(), { wrapper });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('mints a forwarding address from the token returned by get_or_create_email_token', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    rpcMock.mockResolvedValueOnce({ data: 'abc123', error: null });

    const { result } = renderHook(() => useEmailForwardingAddress(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(rpcMock).toHaveBeenCalledWith('get_or_create_email_token');
    expect(result.current.data).toEqual({
      token: 'abc123',
      address: 'trips+abc123@queer.guide',
    });
  });

  it('throws on RPC error', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });

    const { result } = renderHook(() => useEmailForwardingAddress(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useRotateEmailForwardingAddress', () => {
  it('calls rotate_email_token and returns the new token', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    rpcMock.mockResolvedValueOnce({ data: 'new-token', error: null });

    const { result } = renderHook(() => useRotateEmailForwardingAddress(), { wrapper });
    const token = await result.current.mutateAsync();

    expect(token).toBe('new-token');
    expect(rpcMock).toHaveBeenCalledWith('rotate_email_token');
  });

  it('throws on RPC error', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'rls' } });

    const { result } = renderHook(() => useRotateEmailForwardingAddress(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toEqual({ message: 'rls' });
  });
});
