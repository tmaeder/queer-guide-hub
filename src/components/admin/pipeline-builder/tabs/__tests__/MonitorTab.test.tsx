/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../hooks/useUnifiedMonitor', () => ({
  useUnifiedMonitor: () => ({ allRuns: [], stats: { total: 0, running: 0, completed: 0, failed: 0 }, isLoading: false }),
}));
vi.mock('../../hooks/usePipelineHistory', () => ({
  useStagingStats: () => ({ data: [] }),
  useEventIngestStats: () => ({ data: [] }),
  useCityIngestStats: () => ({ data: [] }),
  useCountryIngestStats: () => ({ data: [] }),
  usePipelineRun: () => ({ data: null }),
  usePipelineRuns: () => ({ data: [] }),
  useCircuitBreakers: () => ({ data: [] }),
  usePipelineDefinitionsList: () => ({ data: [] }),
}));

import MonitorTab from '../MonitorTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('MonitorTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<MonitorTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
