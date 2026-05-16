/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) },
}));

import { usePipelineRuns, useUnifiedPipelineOverview, usePipelineRunCounts24h } from '../usePipelineHistory';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('usePipelineHistory hooks', () => {
  it('usePipelineRuns', () => {
    const { result } = renderHook(() => usePipelineRuns(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useUnifiedPipelineOverview', () => {
    const { result } = renderHook(() => useUnifiedPipelineOverview(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('usePipelineRunCounts24h', () => {
    const { result } = renderHook(() => usePipelineRunCounts24h(), { wrapper });
    expect(result.current).toBeDefined();
  });
});
