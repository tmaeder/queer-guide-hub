/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useImportHubQueries', () => ({
  useBatchFindDuplicates: () => ({ mutate: vi.fn(), isPending: false, data: null }),
  useScanTableDuplicates: () => ({ mutate: vi.fn(), isPending: false, data: null }),
  useDuplicatePairs: () => ({ data: [], isLoading: false }),
  useMergeHistory: () => ({ data: [], isLoading: false }),
}));

import { DuplicatesPanel } from '../DuplicatesPanel';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('DuplicatesPanel', () => {
  it('renders three sub-tabs', () => {
    render(<DuplicatesPanel />, { wrapper });
    expect(screen.getByText('Staging Dedup')).toBeInTheDocument();
    expect(screen.getByText('Existing Data')).toBeInTheDocument();
    expect(screen.getByText('Merge History')).toBeInTheDocument();
  });
});
