/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useImportHubQueries', () => ({
  useDuplicateCounts: () => ({ data: null, refetch: vi.fn() }),
  useBatchedAutoClean: () => ({ run: vi.fn(), abort: vi.fn(), progress: null, lastResult: null, isRunning: false }),
  useDuplicatePairs: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
  useMergeHistory: () => ({ data: [], isLoading: false }),
}));

import { AutoCleanDuplicatesTab } from '../AutoCleanDuplicatesTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('AutoCleanDuplicatesTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<AutoCleanDuplicatesTab />, { wrapper });
    expect(container).toBeTruthy();
  });
});
