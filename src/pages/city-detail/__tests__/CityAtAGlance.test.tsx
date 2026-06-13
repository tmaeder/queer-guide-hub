/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useTripSafety', () => ({
  useTripSafety: () => ({
    countries: [],
    crossBorderWarnings: [],
    overallRisk: 'low',
    hasCriminalizedDestination: false,
    hasDeathPenaltyDestination: false,
  }),
}));

import { CityAtAGlance } from '../CityAtAGlance';

const city = {
  population: 3_600_000,
  local_language: 'German',
  best_time_to_visit: 'Summer',
  countries: { id: 'co-de', currency: 'EUR', equality_score: 80 },
} as never;

describe('CityAtAGlance', () => {
  it('renders the headline facts once', () => {
    render(<CityAtAGlance city={city} hasAirport effectiveIata="BER" />);
    expect(screen.getByText('80/100')).toBeInTheDocument();
    expect(screen.getByText('German')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByText('BER')).toBeInTheDocument();
    expect(screen.getByText('3.6M people')).toBeInTheDocument();
  });

  it('links the safety chip to the rights section', () => {
    render(<CityAtAGlance city={city} hasAirport effectiveIata="BER" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '#rights');
  });
});
