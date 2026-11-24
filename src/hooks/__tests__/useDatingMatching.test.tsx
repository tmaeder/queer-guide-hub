import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DEFAULT_MATCHING_SETTINGS, MATCHING_QUERY_KEYS } from '@/lib/intimate/matching';

const { from, rpc, auth, upsert, eq } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  auth: vi.fn(),
  upsert: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth() }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: from, untypedRpc: rpc }));
import { useDatingMatchingSettings, useSaveDatingMatchingSettings } from '../useDatingMatching';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue({ user: { id: 'current-user' } });
  eq.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
  from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }), upsert });
  upsert.mockResolvedValue({ error: null });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('private matching settings', () => {
  it('loads only the signed-in user and opts into nothing by default', async () => {
    const { result } = renderHook(useDatingMatchingSettings, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq).toHaveBeenCalledWith('user_id', 'current-user');
    expect(result.current.data).toEqual(DEFAULT_MATCHING_SETTINGS);
  });
  it('preserves an existing adult opt-in without adding new matching consents', async () => {
    eq.mockReturnValueOnce({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
    eq.mockReturnValueOnce({
      maybeSingle: vi
        .fn()
        .mockResolvedValue({
          data: { opted_in_at: '2026-01-01', consent_18plus_at: '2026-01-01' },
          error: null,
        }),
    });
    const { result } = renderHook(useDatingMatchingSettings, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.dating_enabled).toBe(true);
    expect(result.current.data?.use_intimate).toBe(true);
    expect(result.current.data?.use_checklist).toBe(false);
    expect(result.current.data?.use_identity).toBe(false);
  });
  it('does not query when signed out', () => {
    auth.mockReturnValue({ user: null });
    renderHook(useDatingMatchingSettings, { wrapper });
    expect(from).not.toHaveBeenCalled();
  });
  it('saves under the authenticated identity and refreshes every matching surface', async () => {
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useSaveDatingMatchingSettings, { wrapper });
    await result.current.mutateAsync({
      ...DEFAULT_MATCHING_SETTINGS,
      user_id: 'someone-else',
      rules: { age_bands: { strength: 'required', values: ['30-34'] } },
    });
    expect(upsert.mock.calls[0][0].user_id).toBe('current-user');
    for (const key of MATCHING_QUERY_KEYS)
      expect(invalidation).toHaveBeenCalledWith({ queryKey: [key] });
  });
  it('rejects empty required selections before writing', async () => {
    const { result } = renderHook(useSaveDatingMatchingSettings, { wrapper });
    await expect(
      result.current.mutateAsync({
        ...DEFAULT_MATCHING_SETTINGS,
        rules: { genders: { strength: 'required', values: [] } },
      }),
    ).rejects.toThrow('Choose at least one');
    expect(upsert).not.toHaveBeenCalled();
  });
});
