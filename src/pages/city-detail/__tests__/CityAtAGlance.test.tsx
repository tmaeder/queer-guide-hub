/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CityAtAGlance } from '../CityAtAGlance';

const city = {
  population: 3_600_000,
  local_language: 'German',
  timezone: 'CET',
  countries: { id: 'co-de', currency: 'EUR', equality_score: 80 },
} as never;

describe('CityAtAGlance', () => {
  it('renders the headline facts once', () => {
    render(<CityAtAGlance city={city} hasAirport effectiveIata="BER" />);
    expect(screen.getByText('German')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByText('BER')).toBeInTheDocument();
    expect(screen.getByText('3.6M people')).toBeInTheDocument();
  });

  it('marks a merely NEARBY airport with a tilde', () => {
    render(<CityAtAGlance city={city} hasAirport={false} effectiveIata="BER" />);
    expect(screen.getByText('~BER')).toBeInTheDocument();
  });

  it('labels a nearby airport with its distance, not as the city\'s own', () => {
    // Essen: no airport of its own, DUS 25 km away. Reading "AIRPORT DUS" told
    // the reader something false; the partition columns are what tell them apart.
    const essen = {
      ...city,
      local_airport_codes: null,
      nearest_airport_codes: ['DUS', 'DTM', 'NRN'],
      // PostgREST sends `numeric` as a string.
      nearest_airport_km: '25.2',
    } as never;
    render(<CityAtAGlance city={essen} hasAirport effectiveIata="DUS" />);
    expect(screen.getByText('DUS · 25 km')).toBeInTheDocument();
    expect(screen.getByText('Nearest airport')).toBeInTheDocument();
  });

  it('still calls it the airport when it is actually in the city', () => {
    const cologne = {
      ...city,
      local_airport_codes: ['CGN'],
      nearest_airport_codes: ['DUS'],
      nearest_airport_km: '41.4',
    } as never;
    render(<CityAtAGlance city={cologne} hasAirport effectiveIata="CGN" />);
    expect(screen.getByText('CGN')).toBeInTheDocument();
    expect(screen.queryByText('Nearest airport')).not.toBeInTheDocument();
  });

  it('carries no safety verdict — that moved to GeoSafetyVerdict, once, for all three geo types', () => {
    render(<CityAtAGlance city={city} hasAirport effectiveIata="BER" />);
    expect(screen.queryByText('80/100')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
