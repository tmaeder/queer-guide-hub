/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authMock = vi.hoisted(() => ({ user: null as { id: string } | null }));
const passportMock = vi.hoisted(() => ({
  data: null as
    | null
    | {
        stats: {
          countries_visited: number;
          total_countries: number;
          cities_visited: number;
          venues_visited: number;
          events_visited: number;
          villages_visited: number;
          continents_touched: number;
          pride_events: number;
        };
        visitedCountryIds: Set<string>;
        visitedCityIds: Set<string>;
        visitedVillageIds: Set<string>;
      },
  isLoading: false,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authMock.user, loading: false }),
}));

vi.mock('@/hooks/usePlacesPassport', () => ({
  usePlacesPassport: () => passportMock,
}));

vi.mock('@/hooks/useTrustTier', () => ({
  useMyTier: () => ({ data: { tier: 'scout' } }),
}));

import { PassportStrip } from '../PassportStrip';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('PassportStrip', () => {
  it('shows sign-in CTA when user is anonymous', () => {
    authMock.user = null;
    render(wrap(<PassportStrip />));
    expect(screen.getByText(/Track places you've been/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in/ })).toBeInTheDocument();
  });

  it('shows passport counters and tier badge when signed in', () => {
    authMock.user = { id: 'u1' };
    passportMock.data = {
      stats: {
        countries_visited: 12,
        total_countries: 201,
        cities_visited: 47,
        venues_visited: 0,
        events_visited: 0,
        villages_visited: 0,
        continents_touched: 0,
        pride_events: 0,
      },
      visitedCountryIds: new Set(),
      visitedCityIds: new Set(),
      visitedVillageIds: new Set(),
    };

    render(wrap(<PassportStrip />));
    expect(screen.getByText('Your passport')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('scout')).toBeInTheDocument();
  });
});
