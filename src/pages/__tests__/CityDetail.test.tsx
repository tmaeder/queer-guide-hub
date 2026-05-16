/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useFavorites', () => ({ useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorited: () => false }) }));
vi.mock('@/hooks/useCityImages', () => ({ useCityImages: () => ({ fetchCityImage: vi.fn().mockResolvedValue(null) }) }));
vi.mock('@/hooks/useNews', () => ({ useNews: () => ({ articles: [], loading: false, fetchArticles: vi.fn() }) }));
vi.mock('@/hooks/useVenues', () => ({ useVenues: () => ({ venues: [], loading: false, fetchVenues: vi.fn() }) }));
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }) }));
vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCity: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
  useOptimizedCountry: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/useQueerVillages', () => ({ useQueerVillages: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useNearestAirport', () => ({ useNearestAirport: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => vi.fn() }));
vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));

import CityDetail from '../CityDetail';

describe('CityDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/cities/berlin']}>
        <Routes><Route path="/cities/:slug" element={<CityDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
