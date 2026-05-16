/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/map/EntityMap', () => ({
  EntityMap: () => <div data-testid="entity-map" />,
}));

vi.mock('@/hooks/usePlaceMarks', () => ({
  useMyPlaceMarks: () => ({
    data: [
      {
        id: 'm1',
        user_id: 'u1',
        entity_type: 'venue',
        entity_id: 'v1',
        mark_type: 'visited',
        city_id: 'c1',
        is_public: false,
        note: null,
        marked_at: '2026-03-15T12:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useFootprintEntities: () => ({
    data: {
      venue: [
        {
          id: 'v1',
          name: 'The Bar',
          slug: 'the-bar',
          latitude: 38.7,
          longitude: -9.1,
          city_id: 'c1',
          cities: { name: 'Lisbon', slug: 'lisbon' },
        },
      ],
      event: [],
      village: [],
    },
  }),
  useFootprintCityTotals: () => ({ data: { c1: 40 } }),
}));

vi.mock('@/hooks/useFootprintStats', () => ({
  useFootprintStats: () => ({
    data: {
      countries_visited: 5,
      total_countries: 200,
      cities_visited: 12,
      venues_visited: 30,
      events_visited: 4,
      villages_visited: 1,
      continents_touched: 3,
      pride_events: 2,
    },
  }),
  useFootprintReturnNudge: () => ({
    data: {
      city_id: 'c1',
      city_name: 'Lisbon',
      city_slug: 'lisbon',
      visited_count: 8,
      last_visited_at: '2025-06-01T00:00:00Z',
      new_venues: 7,
    },
  }),
  useFootprintSharePrefs: () => ({
    data: {
      share_countries: false,
      share_cities: false,
      share_venues: false,
      share_events: false,
      share_villages: false,
    },
  }),
}));

vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ data: [{ id: 't1' }] }),
}));

import Footprint from '../Footprint';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Footprint />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Footprint dashboard', () => {
  it('renders stats panel, badges, heatmap and return nudge', () => {
    renderPage();
    expect(screen.getByText('Footprint')).toBeTruthy();
    expect(screen.getByTestId('footprint-stats')).toBeTruthy();
    expect(screen.getByTestId('footprint-badges')).toBeTruthy();
    expect(screen.getByTestId('footprint-heatmap')).toBeTruthy();
    expect(screen.getByTestId('footprint-return-nudge')).toBeTruthy();
    expect(screen.getByText(/5 \/ 200/)).toBeTruthy();
    expect(screen.getByText('First trip')).toBeTruthy();
    expect(screen.getByText('10 cities')).toBeTruthy();
  });
});
