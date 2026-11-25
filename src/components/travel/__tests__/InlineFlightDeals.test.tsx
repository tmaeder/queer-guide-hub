/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { dealsMock } = vi.hoisted(() => ({ dealsMock: vi.fn() }));

vi.mock('@/hooks/useVisitorOrigin', () => ({
  useVisitorOrigin: () => ({ originIata: 'ZRH', originCity: 'Zurich', loading: false }),
}));
vi.mock('@/hooks/useCityAirport', () => ({
  useCityAirport: () => ({ data: 'BER', isLoading: false }),
}));
vi.mock('@/hooks/useTravelDeals', () => ({ useTravelDeals: dealsMock }));
vi.mock('@/components/travel/AirportAutocomplete', () => ({ AirportAutocomplete: () => null }));

import { InlineFlightDeals } from '../InlineFlightDeals';

describe('InlineFlightDeals', () => {
  it('asks for the way out on the first trip day and the way back on the last', () => {
    dealsMock.mockImplementation(({ origin }: { origin?: string }) => ({
      isLoading: false,
      isError: false,
      data:
        origin === 'ZRH'
          ? [
              {
                origin: 'ZRH',
                destination: 'BER',
                price: 137,
                currency: 'eur',
                departure_date: '2026-11-27T14:20:00+01:00',
                return_date: null,
                airline: 'EW',
                flight_number: '8765',
                stops: 0,
                duration: 85,
                affiliate_url: 'https://www.aviasales.com/?params=ZRH2711BER1&marker=452012',
              },
            ]
          : [],
    }));
    render(
      <InlineFlightDeals
        cityId="berlin"
        city="Berlin"
        dates={{ start: '2026-11-27', end: '2026-11-30' }}
      />,
    );
    const calls = dealsMock.mock.calls.map(([args]) => args);
    expect(calls).toContainEqual(
      expect.objectContaining({ origin: 'ZRH', destination: 'BER', departureDate: '2026-11-27' }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ origin: 'BER', destination: 'ZRH', departureDate: '2026-11-30' }),
    );
    expect(screen.getByText('Out · Fri 27 Nov')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: /14:20.*ZRH → BER/ });
    expect(row).toHaveTextContent('1 h 25 min · direct · EW 8765');
    expect(row).toHaveTextContent('137');
    expect(row.getAttribute('href')).toContain('aviasales');
    expect(screen.getByText('Back · Mon 30 Nov')).toBeInTheDocument();
    expect(
      screen.getByText('No recent fares from Berlin to Zurich on this day.'),
    ).toBeInTheDocument();
  });

  it('flags a long layover and leaves a quick direct flight alone', () => {
    const fare = (stops: number, duration: number) => ({
      origin: 'ZRH',
      destination: 'BER',
      price: 100,
      currency: 'eur',
      departure_date: '2026-11-27T21:55:00+01:00',
      return_date: null,
      airline: 'U2',
      flight_number: '2972',
      stops,
      duration,
      affiliate_url: '',
    });
    dealsMock.mockImplementation(({ origin }: { origin?: string }) => ({
      isLoading: false,
      isError: false,
      data: [origin === 'ZRH' ? fare(1, 680) : fare(0, 85)],
    }));
    render(
      <InlineFlightDeals
        cityId="berlin"
        city="Berlin"
        dates={{ start: '2026-11-27', end: '2026-11-30' }}
      />,
    );
    expect(screen.getAllByText('Long layover')).toHaveLength(1);
  });
});
