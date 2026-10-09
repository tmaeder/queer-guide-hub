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
  latitude: 52.52,
  longitude: 13.4,
  local_airport_codes: ['BER'],
  countries: { id: 'co-de', currency: 'EUR', equality_score: 80 },
};

describe('CityAtAGlance', () => {
  it('renders the headline facts once', () => {
    render(<CityAtAGlance city={city as never} />);
    expect(screen.getByText('German')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByText('BER')).toBeInTheDocument();
    expect(screen.getByText('3.6M people')).toBeInTheDocument();
  });

  it('says "No" for a city with no airport of its own, and names no nearby one', () => {
    // Aachen: Maastricht Aachen Airport is in the Netherlands. The strip used
    // to read "Nearest airport DUS · 74 km" — repeated from the travel section,
    // and the wrong airport for a border city.
    const aachen = {
      ...city,
      local_airport_codes: null,
      nearest_airport_codes: ['DUS', 'CGN'],
      nearest_airport_km: '74.4',
      major_airport_code: 'DUS',
    } as never;
    render(<CityAtAGlance city={aachen} />);
    expect(screen.getByText('Airport')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.queryByText(/DUS/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nearest airport')).not.toBeInTheDocument();
  });

  it('lists every airport the city has of its own', () => {
    render(<CityAtAGlance city={{ ...city, local_airport_codes: ['TXL', 'BER'] } as never} />);
    expect(screen.getByText('TXL, BER')).toBeInTheDocument();
  });

  it('claims nothing for a city that was never measured (no coordinates)', () => {
    render(
      <CityAtAGlance
        city={{ ...city, local_airport_codes: null, latitude: null, longitude: null } as never}
      />,
    );
    expect(screen.queryByText('Airport')).not.toBeInTheDocument();
    expect(screen.queryByText('No')).not.toBeInTheDocument();
  });

  it('carries no safety verdict — that moved to GeoSafetyVerdict, once, for all three geo types', () => {
    render(<CityAtAGlance city={city as never} />);
    expect(screen.queryByText('80/100')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
