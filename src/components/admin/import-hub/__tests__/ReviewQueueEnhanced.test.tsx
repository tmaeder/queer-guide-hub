/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));
vi.mock('@/hooks/useImportHubQueries', () => ({
  useStagingItems: () => ({ data: { items: [], totalCount: 0 }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useStagingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useEntityById: () => ({ data: null }),
}));

import { ReviewQueueEnhanced } from '../ReviewQueueEnhanced';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('ReviewQueueEnhanced', () => {
  it('renders without crashing', () => {
    const { container } = render(<ReviewQueueEnhanced />, { wrapper });
    expect(container).toBeTruthy();
  });
});
