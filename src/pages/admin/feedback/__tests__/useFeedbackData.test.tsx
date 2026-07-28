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
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    channel: () => ({
      on: function () { return this; },
      subscribe: function () { return this; },
      track: vi.fn().mockReturnValue(Promise.resolve()),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

import { useFeedbackData } from '../useFeedbackData';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useFeedbackData', () => {
  it('returns shape', () => {
    const state = { q: '', status: 'all', category: 'all', priority: 'all', sort: 'newest' } as never;
    const { result } = renderHook(() => useFeedbackData(state), { wrapper });
    expect(result.current).toBeDefined();
  });
});
