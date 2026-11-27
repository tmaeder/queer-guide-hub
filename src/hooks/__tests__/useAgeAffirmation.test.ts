import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const unsubscribe = vi.fn();
let authCallback: ((event: string, session: unknown) => void) | undefined;
const accountMocks = vi.hoisted(() => ({
  updateUser: vi.fn().mockResolvedValue({ error: null }),
  updateProfile: vi.fn().mockResolvedValue({
    data: { age_confirmed_at: '2026-10-11T00:00:00.000Z' },
    error: null,
  }),
  profileLookup: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      updateUser: accountMocks.updateUser,
    },
    // get_my_profile is the read; set_my_age_confirmation the write.
    rpc: (fn: string) =>
      fn === 'get_my_profile'
        ? { maybeSingle: accountMocks.profileLookup }
        : accountMocks.updateProfile().then((r: { data: { age_confirmed_at: string } | null }) => ({
            data: r.data?.age_confirmed_at ?? null,
            error: null,
          })),
  },
}));

import { useAgeAffirmation } from '../useAgeAffirmation';

const KEY = 'qg_age_affirmation';
const LEGACY_MARKETPLACE_KEY = 'qg.marketplace.ageAck';

describe('useAgeAffirmation', () => {
  beforeEach(() => {
    localStorage.clear();
    unsubscribe.mockClear();
    accountMocks.updateUser.mockClear();
    accountMocks.updateProfile.mockClear();
    accountMocks.profileLookup.mockReset();
    accountMocks.profileLookup.mockResolvedValue({ data: null, error: null });
  });

  it('checks account state before declaring a fresh visitor unaffirmed', async () => {
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.status).toBe('checking');
    act(() => authCallback?.('INITIAL_SESSION', null));
    await waitFor(() => expect(result.current.status).toBe('unaffirmed'));
  });

  it('persists confirmation and synchronizes it to the signed-in account', async () => {
    const { result } = renderHook(() => useAgeAffirmation());
    await act(async () => {
      await result.current.affirm();
    });
    expect(result.current.affirmed).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').affirmedAt).toEqual(expect.any(Number));
    expect(accountMocks.updateUser).toHaveBeenCalledWith({
      data: { age_confirmed_at: expect.any(String) },
    });
    expect(accountMocks.updateProfile).toHaveBeenCalled();
  });

  it('does not let an older profile lookup undo a new confirmation', async () => {
    let finishLookup!: (value: { data: null; error: null }) => void;
    accountMocks.profileLookup.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => authCallback?.('SIGNED_IN', { user: { id: 'user-1' } }));
    await waitFor(() => expect(accountMocks.profileLookup).toHaveBeenCalled());
    await act(async () => {
      await result.current.affirm();
    });
    await act(async () => {
      finishLookup({ data: null, error: null });
    });
    expect(result.current.status).toBe('affirmed');
  });

  it('does not let an older profile lookup undo a local revocation', async () => {
    let finishLookup!: (value: { data: { age_confirmed_at: string }; error: null }) => void;
    accountMocks.profileLookup.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => authCallback?.('SIGNED_IN', { user: { id: 'user-1' } }));
    await waitFor(() => expect(accountMocks.profileLookup).toHaveBeenCalled());
    act(() => result.current.revoke());
    await act(async () => {
      finishLookup({ data: { age_confirmed_at: '2026-10-11T00:00:00Z' }, error: null });
    });
    expect(result.current.status).toBe('unaffirmed');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps an existing confirmation instead of expiring it after 30 days', () => {
    const longAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorage.setItem(KEY, JSON.stringify({ affirmedAt: longAgo }));
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(true);
  });

  it('migrates a Marketplace acknowledgement into canonical state', () => {
    localStorage.setItem(LEGACY_MARKETPLACE_KEY, new Date().toISOString());
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(true);
    expect(localStorage.getItem(KEY)).toBeTruthy();
  });

  it('migrates legacy consent even when canonical storage is malformed', () => {
    localStorage.setItem(KEY, 'not json');
    localStorage.setItem(LEGACY_MARKETPLACE_KEY, new Date().toISOString());
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(true);
  });

  it('adopts the confirmation already recorded during signup', async () => {
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => {
      authCallback?.('SIGNED_IN', {
        user: {
          id: 'user-1',
          user_metadata: { age_confirmed_at: '2026-01-01T00:00:00.000Z' },
        },
      });
    });
    await waitFor(() => expect(result.current.affirmed).toBe(true));
    expect(localStorage.getItem(KEY)).toBeTruthy();
  });

  it('restores confirmation from an older account profile on a new device', async () => {
    accountMocks.profileLookup.mockResolvedValueOnce({
      data: { age_confirmed_at: '2025-06-01T00:00:00.000Z' },
      error: null,
    });
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => {
      authCallback?.('SIGNED_IN', { user: { id: 'user-1', user_metadata: {} } });
    });
    await waitFor(() => expect(result.current.affirmed).toBe(true));
  });

  it('does not emit another auth update when a legacy profile repair fails', async () => {
    accountMocks.updateProfile.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => {
      authCallback?.('SIGNED_IN', {
        user: { id: 'user-1', user_metadata: { age_confirmed_at: '2025-06-01T00:00:00Z' } },
      });
    });
    await waitFor(() => expect(result.current.accountSyncError).toBeTruthy());
    expect(result.current.affirmed).toBe(true);
    expect(accountMocks.updateUser).not.toHaveBeenCalled();
  });

  it('does not declare the reader unaffirmed while a profile lookup is pending', async () => {
    let resolveLookup: ((value: unknown) => void) | undefined;
    accountMocks.profileLookup.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => {
      authCallback?.('INITIAL_SESSION', { user: { id: 'user-1', user_metadata: {} } });
    });
    await waitFor(() => expect(accountMocks.profileLookup).toHaveBeenCalled());
    expect(result.current.status).toBe('checking');
    await act(async () => {
      resolveLookup?.({
        data: { age_confirmed_at: '2025-06-01T00:00:00.000Z' },
        error: null,
      });
    });
    await waitFor(() => expect(result.current.status).toBe('affirmed'));
  });

  it('keeps the gate neutral when account restoration fails', async () => {
    accountMocks.profileLookup.mockResolvedValueOnce({
      data: null,
      error: new Error('network unavailable'),
    });
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => {
      authCallback?.('INITIAL_SESSION', { user: { id: 'user-1', user_metadata: {} } });
    });
    await waitFor(() => expect(result.current.accountSyncError).toBeTruthy());
    expect(result.current.status).toBe('checking');
  });

  it('propagates confirmation to another hook instance in the same tab', async () => {
    const first = renderHook(() => useAgeAffirmation());
    const second = renderHook(() => useAgeAffirmation());
    await act(async () => {
      await first.result.current.affirm();
    });
    expect(second.result.current.affirmed).toBe(true);
  });

  it('revoke clears canonical and legacy browser records', () => {
    localStorage.setItem(KEY, JSON.stringify({ affirmedAt: Date.now() }));
    localStorage.setItem(LEGACY_MARKETPLACE_KEY, new Date().toISOString());
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => result.current.revoke());
    expect(result.current.affirmed).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_MARKETPLACE_KEY)).toBeNull();
  });
});
