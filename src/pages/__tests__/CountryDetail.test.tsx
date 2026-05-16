/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => ({ track: vi.fn() }) }));
vi.mock('@/hooks/useWorldBankData', () => ({ useWorldBankData: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useSDGData', () => ({ useSDGData: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCountry: () => ({ country: null, loading: false }),
  useOptimizedCities: () => ({ cities: [], loading: false }),
}));
vi.mock('@/hooks/useVenues', () => ({ useVenues: () => ({ venues: [], loading: false, fetchVenues: vi.fn() }) }));
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }) }));
vi.mock('@/hooks/useNews', () => ({ useNews: () => ({ articles: [], loading: false, fetchArticles: vi.fn() }) }));
vi.mock('@/components/country/SafetyAlertBanner', () => ({ default: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));

import CountryDetail from '../CountryDetail';

describe('CountryDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/countries/germany']}>
        <Routes><Route path="/countries/:slug" element={<CountryDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
