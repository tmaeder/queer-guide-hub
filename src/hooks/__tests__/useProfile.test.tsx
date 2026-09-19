import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestProviders } from '@/test/test-utils';
import type { ReactNode } from 'react';

const { mockMaybeSingle, mockUpdate, mockUpdateEq, mockUpsert } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateEq: vi.fn(),
  // Deliberately present so a regression to upsert() is a FAILED ASSERTION rather
  // than a TypeError swallowed by updateProfile's try/catch — which is exactly how
  // the 42501 shipped past this suite the first time.
  mockUpsert: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // The own-row read moved off `from('profiles').select().eq()` onto the
    // SECURITY DEFINER `get_my_profile()`, so the same mockMaybeSingle now has
    // to answer rpc() as well — the hook's write paths still use from().
    // updateProfile's catch branch asks for the session to tell an expired login
    // ('auth') apart from a transient failure ('transient'), so the error-path tests
    // need it present.
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc: () => ({ maybeSingle: mockMaybeSingle }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: (...eqArgs: unknown[]) => mockUpdateEq(...eqArgs) };
      },
      upsert: mockUpsert,
    }),
  },
}));

import { useProfile } from '../useProfile';

function wrapper({ children }: { children: ReactNode }) {
  return <TestProviders>{children}</TestProviders>;
}

describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start loading', () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useProfile(), { wrapper });
    expect(result.current.loading).toBe(true);
  });

  it('should load profile', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1', display_name: 'Test User' },
      error: null,
    });
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile?.display_name).toBe('Test User');
  });

  it('should handle error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('fail') });
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('should expose updateProfile', () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useProfile(), { wrapper });
    expect(typeof result.current.updateProfile).toBe('function');
  });

  // Regression guard for the /settings save that 403'd on prod.
  //
  // `authenticated` holds only COLUMN grants on profiles — no table-level privilege.
  // Postgres serves a plain UPDATE from column grants but requires table-level UPDATE
  // for `INSERT ... ON CONFLICT DO UPDATE`, so upsert() raised
  // `42501 permission denied for table profiles` and every save silently failed.
  // Verified against prod: PATCH 204, POST-on_conflict 403.
  describe('updateProfile write shape', () => {
    beforeEach(() => {
      mockMaybeSingle.mockResolvedValue({ data: { user_id: 'user-1' }, error: null });
      mockUpdateEq.mockResolvedValue({ error: null, count: 1 });
    });

    it('writes with update().eq(), never upsert()', async () => {
      const { result } = renderHook(() => useProfile(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const res = await result.current.updateProfile({ first_name: 'Ada' });

      expect(res.error).toBeNull();
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdateEq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('asks for an exact rowcount and does not send user_id in the payload', async () => {
      const { result } = renderHook(() => useProfile(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.updateProfile({ first_name: 'Ada' });

      const [values, options] = mockUpdate.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(values.first_name).toBe('Ada');
      // user_id belongs in the WHERE, not the SET — updating a row's own key is a
      // no-op at best and needs a grant the narrowed role may not keep.
      expect(values).not.toHaveProperty('user_id');
      expect(options).toEqual({ count: 'exact' });
    });

    it('reports a save that matched no row instead of claiming success', async () => {
      // PostgREST answers a non-matching WHERE with 204 and no error, so without the
      // rowcount check the UI would say "All changes saved" over a write that wrote
      // nothing — the same silent lie the 42501 produced.
      mockUpdateEq.mockResolvedValue({ error: null, count: 0 });
      const { result } = renderHook(() => useProfile(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const res = await result.current.updateProfile({ first_name: 'Ada' });

      expect(res.error).toBeTruthy();
      expect(res.data).toBeNull();
    });
  });
});
