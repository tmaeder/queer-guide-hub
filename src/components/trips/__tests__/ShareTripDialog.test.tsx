/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useTripShares', () => ({
  useTripShares: () => ({ data: [], isLoading: false }),
  useCreateTripShare: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) }),
  useRevokeTripShare: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) }),
}));

import { ShareTripDialog } from '../ShareTripDialog';

describe('ShareTripDialog', () => {
  it('renders closed without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <ShareTripDialog open={false} onClose={vi.fn()} tripId="t1" />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
