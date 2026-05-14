import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mock the Supabase client BEFORE importing the hook so the auth listener
// is a no-op stub.
const unsubscribe = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (_cb: unknown) => ({
        data: { subscription: { unsubscribe } },
      }),
    },
  },
}));

import { useAgeAffirmation } from '../useAgeAffirmation';

const KEY = 'qg_age_affirmation';

describe('useAgeAffirmation (P0-3)', () => {
  beforeEach(() => {
    localStorage.clear();
    unsubscribe.mockClear();
  });

  it('starts unaffirmed for a fresh visitor', () => {
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(false);
  });

  it('affirm() persists to localStorage and flips state', () => {
    const { result } = renderHook(() => useAgeAffirmation());
    act(() => result.current.affirm());
    expect(result.current.affirmed).toBe(true);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(typeof stored.affirmedAt).toBe('number');
  });

  it('rehydrates from a fresh localStorage entry', () => {
    localStorage.setItem(KEY, JSON.stringify({ affirmedAt: Date.now() }));
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(true);
  });

  it('treats entries older than 30 days as expired', () => {
    const longAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorage.setItem(KEY, JSON.stringify({ affirmedAt: longAgo }));
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(false);
  });

  it('revoke() clears storage and state', () => {
    localStorage.setItem(KEY, JSON.stringify({ affirmedAt: Date.now() }));
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(true);
    act(() => result.current.revoke());
    expect(result.current.affirmed).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ignores malformed storage entries', () => {
    localStorage.setItem(KEY, 'not json');
    const { result } = renderHook(() => useAgeAffirmation());
    expect(result.current.affirmed).toBe(false);
  });
});
