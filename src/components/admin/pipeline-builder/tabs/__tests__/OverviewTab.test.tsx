/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

const { invoke, overview } = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: {}, error: null })),
  overview: vi.fn(),
}));

beforeEach(() => {
  overview.mockReturnValue({ data: [], isLoading: false });
  invoke.mockClear();
});
afterEach(cleanup);

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }), functions: { invoke } },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: vi.fn() },
  untypedFrom: () => ({
    select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
  }),
}));
vi.mock('../../hooks/usePipelineHistory', () => ({
  useUnifiedPipelineOverview: overview,
  usePipelineRunCounts24h: () => ({ data: {} }),
  useCircuitBreakers: () => ({ data: [] }),
}));

import OverviewTab from '../OverviewTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('OverviewTab', () => {
  it.each([
    ['weekly-data-source-sync', 'pipeline-weekly-source-sync'],
    ['venue-ingestion-unified', 'pipeline-executor'],
  ])('runs %s through its registered worker from the overview', async (name, endpoint) => {
    overview.mockReturnValue({
      data: [
        {
          kind: 'pipeline',
          id: 'pipeline-id',
          name,
          display_name: name,
          is_enabled: true,
          is_template: false,
          schedule: null,
          last_run_at: null,
          recent_statuses: [],
          recent_total_count: 0,
        },
      ],
      isLoading: false,
    });
    render(<OverviewTab />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(endpoint, {
        body: { pipeline_id: 'pipeline-id', triggered_by: 'manual-overview' },
      }),
    );
  });
  it('renders without crashing', () => {
    const { container } = render(<OverviewTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
