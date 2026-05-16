/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) } }));
vi.mock('@/hooks/usePipelineBuilderTabs', () => ({
  fetchSourceCoverageTargets: vi.fn().mockResolvedValue([]),
  fetchHotelIngestStats: vi.fn().mockResolvedValue([]),
}));

import CoverageTab from '../CoverageTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('CoverageTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<CoverageTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
