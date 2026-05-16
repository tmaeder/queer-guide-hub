/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

import { usePipelineBuilder, usePipelineNodeTypes, usePipelineDefinitions } from '../usePipelineBuilder';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}><ReactFlowProvider>{children}</ReactFlowProvider></QueryClientProvider>;
}

describe('usePipelineBuilder', () => {
  it('main hook returns shape', () => {
    const { result } = renderHook(() => usePipelineBuilder(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('node types hook works', () => {
    const { result } = renderHook(() => usePipelineNodeTypes(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('definitions hook works', () => {
    const { result } = renderHook(() => usePipelineDefinitions(), { wrapper });
    expect(result.current).toBeDefined();
  });
});
