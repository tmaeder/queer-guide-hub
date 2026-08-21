/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/weather/WeatherForecast', () => ({
  WeatherForecast: () => <div>weather</div>,
}));

import { CityOverviewTab } from '../CityOverviewTab';

const city = {
  id: 'c1',
  name: 'Berlin',
  description: 'A creative capital.',
  timezone: 'CET',
  universities: ['HU Berlin'],
  cost_of_living: { band: 'High', scope: 'Country-level estimate, not city-specific' },
} as never;

describe('CityOverviewTab', () => {
  it('renders the description and city facts', () => {
    render(
      <MemoryRouter>
        <CityOverviewTab city={city} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/A creative capital/)).toBeInTheDocument();
    // Timezone is deliberately NOT repeated here — the head fact strip
    // (`CityAtAGlance`) carries it, and a headline fact lives once.
    expect(screen.queryByText('Timezone')).not.toBeInTheDocument();
    expect(screen.getByText('HU Berlin')).toBeInTheDocument();
  });

  it('hides the description when the masthead lead already rendered it', () => {
    // showDescription={false} is passed by the page when there is no
    // editorial_hook — the lead fell back to the description, so About must
    // not print the same paragraph again.
    render(
      <MemoryRouter>
        <CityOverviewTab city={city} showDescription={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/A creative capital/)).not.toBeInTheDocument();
  });

  it('prints every cost_of_living key, including the scope caveat', () => {
    // The value is derived from the COUNTRY's GDP per capita. Rendering only
    // `band` would silently upgrade a country-level estimate into a claim
    // about this city.
    render(
      <MemoryRouter>
        <CityOverviewTab city={city} />
      </MemoryRouter>,
    );
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText(/Country-level estimate, not city-specific/)).toBeInTheDocument();
  });

  it('renders no block for the columns that are empty in production', () => {
    // notable_landmarks / demographics / economy_sectors are 0.0% populated
    // across the 3,070 live cities; each used to have a heading here.
    render(
      <MemoryRouter>
        <CityOverviewTab
          city={{ ...(city as object), universities: [], cost_of_living: null } as never}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Notable landmarks/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Demographics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Economy/i)).not.toBeInTheDocument();
  });
});
