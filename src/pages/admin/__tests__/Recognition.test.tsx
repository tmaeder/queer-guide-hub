/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useRecognitions', () => ({
  useAdminRecognitions: () => ({ data: [], isLoading: false }),
  useContributionMetrics: () => ({ data: [], isLoading: false }),
  useRecognitionMutations: () => ({
    upsert: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null), isPending: false },
    remove: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null), isPending: false },
    refreshMetrics: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null), isPending: false },
  }),
}));

import AdminRecognition from '../Recognition';

describe('AdminRecognition', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<QueryClientProvider client={qc}><AdminRecognition /></QueryClientProvider>);
    expect(container).toBeTruthy();
  });
});
