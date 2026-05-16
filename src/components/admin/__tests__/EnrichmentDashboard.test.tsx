/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useEnrichmentDashboard', () => ({
  useEnrichmentDashboard: () => ({ data: null, isLoading: false }),
  useEnrichmentFailures: () => ({ data: [], isLoading: false }),
  useRetryEnrichment: () => ({ mutate: vi.fn(), isPending: false }),
  useResolveReviewItem: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { EnrichmentDashboard } from '../EnrichmentDashboard';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('EnrichmentDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<EnrichmentDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
