/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/components/travel/CityTravelHub', () => ({
  CityTravelHub: () => <div>CityTravelHub</div>,
}));

const nearestMock = vi.fn();
vi.mock('@/hooks/useCityNearestAirports', () => ({
  useCityNearestAirports: (id: string | null) => nearestMock(id),
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
  beforeEach(() => {
    nearestMock.mockReset();
    nearestMock.mockReturnValue({ data: [] });
  });

  it('states the airport once: "No" plus the three nearest, across borders', () => {
    nearestMock.mockReturnValue({
      data: [
        {
          iata_code: 'MST',
          city: 'Maastricht',
          airport_name: 'Maastricht Aachen Airport',
          country_code: 'NL',
          distance_km: '26.6',
        },
        {
          iata_code: 'LGG',
          city: 'Grâce-Hollogne',
          airport_name: 'Liège Airport',
          country_code: 'BE',
          distance_km: '47.6',
        },
        {
          iata_code: 'DUS',
          city: 'Düsseldorf',
          airport_name: 'Düsseldorf Airport',
          country_code: 'DE',
          distance_km: '74.4',
        },
      ],
    });
    const aachen = {
      ...base,
      id: 'aachen',
      name: 'Aachen',
      slug: 'aachen',
      latitude: 50.78,
      longitude: 6.08,
      local_airport_codes: null,
      nearest_airport_codes: ['DUS', 'CGN'],
      nearest_airport_km: '74.4',
      airport_codes: ['DUS', 'CGN'],
      transportation_info: { airports: 'DUS — Düsseldorf Airport', rail: 'Aachen Hbf' },
    };
    render(<CityTravelTab city={aachen as never} effectiveIata="DUS" />, { wrapper });
    expect(nearestMock).toHaveBeenCalledWith('aachen');
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText('Nearest airports')).toBeInTheDocument();
    expect(screen.getByText('MST · Maastricht · 27 km')).toBeInTheDocument();
    expect(screen.getByText('LGG · Grâce-Hollogne · 48 km')).toBeInTheDocument();
    expect(screen.getByText('DUS · Düsseldorf · 74 km')).toBeInTheDocument();
    // The old repeats are gone.
    expect(screen.queryByText('All airport codes')).not.toBeInTheDocument();
    expect(screen.queryByText('Other airports nearby')).not.toBeInTheDocument();
    expect(screen.queryByText('DUS — Düsseldorf Airport')).not.toBeInTheDocument();
    // Other transport lines still render.
    expect(screen.getByText('Aachen Hbf')).toBeInTheDocument();
  });

  it("names the city's own airport and asks no nearest list for a city without coordinates", () => {
    render(
      <CityTravelTab
        city={{ ...base, local_airport_codes: ['BER'] } as never}
        effectiveIata="BER"
      />,
      { wrapper },
    );
    expect(screen.getByText('BER')).toBeInTheDocument();
    expect(nearestMock).toHaveBeenCalledWith(null);
    expect(screen.queryByText('No')).not.toBeInTheDocument();
  });

  it('renders the travel hub for an ordinary destination', () => {
    render(<CityTravelTab city={base as never} effectiveIata={null} />, { wrapper });
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
      />,
      { wrapper },
    );
    expect(screen.queryByText('CityTravelHub')).not.toBeInTheDocument();
    expect(screen.getByText(/criminal penalties/)).toBeInTheDocument();
  });

  it('draws the network diagram only for a city that has one', () => {
    // Berlin has generated geometry; Kampala does not, and a fabricated
    // network under "Getting around" would be a false claim about its transit.
    const { rerender } = render(<CityTravelTab city={base as never} effectiveIata={null} />, {
      wrapper,
    });
    expect(screen.getByText('U7')).toBeInTheDocument();

    rerender(
      <CityTravelTab
        city={{ ...base, name: 'Kampala', slug: 'kampala' } as never}
        effectiveIata={null}
      />,
    );
    expect(screen.queryByText('U7')).not.toBeInTheDocument();
  });
});
