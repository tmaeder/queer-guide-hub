/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
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

import { useAdminFeedbackController } from '../useAdminFeedbackController';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe('useAdminFeedbackController', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useAdminFeedbackController(), { wrapper });
    expect(result.current).toBeDefined();
  });
});
