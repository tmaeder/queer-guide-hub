/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useTravelDeals', () => ({ useTravelDeals: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useHotelSearch', () => ({ useHotelSearch: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useActivitySearch', () => ({ useActivitySearch: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useVisitorOrigin', () => ({ useVisitorOrigin: () => ({ originIata: null, originCity: null, loading: false }) }));

import { CityTravelHub } from '../CityTravelHub';

describe('CityTravelHub', () => {
  it('renders', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><CityTravelHub destinationIata="BER" destinationCity="Berlin" equalityScore={0.9} /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
