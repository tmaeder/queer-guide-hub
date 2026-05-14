import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestProviders } from '@/test/test-utils';
import type { ReactNode } from 'react';

const { mockMaybeSingle } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import { useProfile } from '../useProfile';

function wrapper({ children }: { children: ReactNode }) {
  return <TestProviders>{children}</TestProviders>;
}

describe('useProfile', () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
});
