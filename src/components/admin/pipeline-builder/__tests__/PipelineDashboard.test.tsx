/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } } }));
vi.mock('../hooks/usePipelineHistory', () => ({
  usePipelineRuns: () => ({ data: [], isLoading: false }),
  useCircuitBreakers: () => ({ data: [] }),
  useStagingStats: () => ({ data: [] }),
  usePipelineDefinitionsList: () => ({ data: [] }),
  usePipelineHealthAlerts: () => ({ data: [] }),
}));

import PipelineDashboard from '../PipelineDashboard';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('PipelineDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<PipelineDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
