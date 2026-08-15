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

  it('carries no safety verdict — that moved to GeoSafetyVerdict, once, for all three geo types', () => {
    render(<CityAtAGlance city={city} hasAirport effectiveIata="BER" />);
    expect(screen.queryByText('80/100')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
