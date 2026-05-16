/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on: function () { return this; }, subscribe: function () { return this; }, track: vi.fn(), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

import { useTripPresence } from '../useTripPresence';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useTripPresence', () => {
  it('returns empty array initially', () => {
    const { result } = renderHook(() => useTripPresence('t1'), { wrapper });
    expect(Array.isArray(result.current)).toBe(true);
  });
  it('returns [] when no tripId', () => {
    const { result } = renderHook(() => useTripPresence(undefined), { wrapper });
    expect(result.current).toEqual([]);
  });
});
