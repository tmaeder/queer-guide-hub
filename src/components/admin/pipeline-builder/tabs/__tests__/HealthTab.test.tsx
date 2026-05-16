/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve({ data: [], error: null });
    return chain;
  },
  untypedSupabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
}));
vi.mock('../../hooks/usePipelineHistory', () => ({
  useCircuitBreakers: () => ({ data: [] }),
  useStagingStats: () => ({ data: [] }),
  usePipelineDefinitionsList: () => ({ data: [] }),
}));

import HealthTab from '../HealthTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('HealthTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<HealthTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
