/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
    channel: () => ({ on: function () { return this; }, subscribe: function () { return this; }, unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

import { usePipelineExecution } from '../usePipelineExecution';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePipelineExecution', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => usePipelineExecution(null, vi.fn()), { wrapper });
    expect(result.current).toBeDefined();
  });
});
