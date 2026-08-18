/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/components/travel/CityTravelHub', () => ({
  CityTravelHub: () => <div>CityTravelHub</div>,
}));

import { CityTravelTab } from '../CityTravelTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

const base = { id: 'c1', name: 'Berlin', slug: 'berlin' };

describe('CityTravelTab', () => {
  it('renders the travel hub for an ordinary destination', () => {
    render(
      <CityTravelTab
        city={base as never}
        effectiveIata={null}
        hasAirport={false}
        nearestAirport={null}
      />,
      { wrapper },
    );
    expect(screen.getByText('CityTravelHub')).toBeInTheDocument();
  });

  it('suppresses every deal module where LGBTQ+ people face criminal penalties', () => {
    render(
      <CityTravelTab
        city={
          {
            ...base,
            name: 'Kampala',
            slug: 'kampala',
            countries: { lgbti_criminalization: { legal: false } },
          } as never
        }
        effectiveIata={null}
        hasAirport={false}
        nearestAirport={null}
      />,
      { wrapper },
    );
    expect(screen.queryByText('CityTravelHub')).not.toBeInTheDocument();
    expect(screen.getByText(/criminal penalties/)).toBeInTheDocument();
  });

  it('draws the network diagram only for a city that has one', () => {
    // Berlin has generated geometry; Kampala does not, and a fabricated
    // network under "Getting around" would be a false claim about its transit.
    const { rerender } = render(
      <CityTravelTab
        city={base as never}
        effectiveIata={null}
        hasAirport={false}
        nearestAirport={null}
      />,
      { wrapper },
    );
    expect(screen.getByText('U7')).toBeInTheDocument();

    rerender(
      <CityTravelTab
        city={{ ...base, name: 'Kampala', slug: 'kampala' } as never}
        effectiveIata={null}
        hasAirport={false}
        nearestAirport={null}
      />,
    );
    expect(screen.queryByText('U7')).not.toBeInTheDocument();
  });
});
