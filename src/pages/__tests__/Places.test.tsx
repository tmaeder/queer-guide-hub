/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCountries: () => ({ countries: [], loading: false }),
  useOptimizedCities: () => ({ cities: [], loading: false }),
}));
vi.mock('@/hooks/useQueerVillages', () => ({ useQueerVillages: () => ({ villages: [], data: [], isLoading: false, loading: false }) }));
vi.mock('@/hooks/useContinents', () => ({ useContinents: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import Places from '../Places';

describe('Places', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><Places /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
