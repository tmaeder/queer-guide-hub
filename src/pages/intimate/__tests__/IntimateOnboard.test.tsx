/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useIntimateKinkTags: () => ({ data: [], isLoading: false }),
  useMyIntimateProfile: () => ({ data: null, isLoading: false }),
  useMyIntimateText: () => ({ data: null, isLoading: false }),
  useSetIntimateText: () => ({ mutateAsync: vi.fn().mockResolvedValue(null), isPending: false }),
  useUpsertIntimateProfile: () => ({ mutateAsync: vi.fn().mockResolvedValue(null), isPending: false }),
}));

import IntimateOnboard from '../IntimateOnboard';

describe('IntimateOnboard', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><IntimateOnboard /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
