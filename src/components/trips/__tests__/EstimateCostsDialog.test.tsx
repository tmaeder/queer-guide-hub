/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useTripCostEstimate', () => ({
  useCostEstimate: () => ({ data: null, isLoading: false }),
  useGenerateCostEstimate: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { EstimateCostsDialog } from '../EstimateCostsDialog';

describe('EstimateCostsDialog', () => {
  it('renders closed without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <EstimateCostsDialog open={false} onClose={vi.fn()} tripId="t1" members={[]} currentUserId="u1" />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
