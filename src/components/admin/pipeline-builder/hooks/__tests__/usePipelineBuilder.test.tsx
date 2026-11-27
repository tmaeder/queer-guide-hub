/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { pipeline_run_id: 'run' }, error: null })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

import {
  usePipelineBuilder,
  usePipelineNodeTypes,
  usePipelineDefinitions,
} from '../usePipelineBuilder';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </QueryClientProvider>
  );
}

describe('usePipelineBuilder', () => {
  it('main hook returns shape', () => {
    const { result } = renderHook(() => usePipelineBuilder(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it.each([
    ['weekly-data-source-sync', 'pipeline-weekly-source-sync'],
    ['venue-ingestion-unified', 'pipeline-executor'],
  ])('routes %s to its registered worker', async (slug, endpoint) => {
    invoke.mockClear();
    const { result } = renderHook(() => usePipelineBuilder(), { wrapper });
    act(() => result.current.setPipelineSlug(slug));
    act(() => result.current.run({ dryRun: true }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(endpoint, {
        body: expect.objectContaining({ pipeline_name: slug, dry_run: true }),
      }),
    );
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
