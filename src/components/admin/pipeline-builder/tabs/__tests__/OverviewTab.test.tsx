/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
}));
vi.mock('../../hooks/usePipelineHistory', () => ({
  useUnifiedPipelineOverview: () => ({ data: [], isLoading: false }),
  usePipelineRunCounts24h: () => ({ data: {} }),
  useCircuitBreakers: () => ({ data: [] }),
}));

import OverviewTab from '../OverviewTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>
    </MemoryRouter>
  );
}

describe('OverviewTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<OverviewTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
