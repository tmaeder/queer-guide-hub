/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useDiscoverableTrips', () => ({
  useDiscoverableTrips: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import TripsDiscoverPage from '../TripsDiscoverPage';

describe('TripsDiscoverPage', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><TripsDiscoverPage /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
