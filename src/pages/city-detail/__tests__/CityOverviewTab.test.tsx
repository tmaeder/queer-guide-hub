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

// `base` stays untyped so it can be spread; `city` is the `as never` form the
// component's own prop type (CityRelation = any) expects. Spreading the cast
// value directly is a TS2698.
const base = {
  id: 'c1',
  name: 'Berlin',
  description: 'A creative capital.',
  timezone: 'CET',
  universities: ['HU Berlin'],
  cost_of_living: { band: 'High', scope: 'Country-level estimate, not city-specific' },
};
const city = base as never;

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

  it('ranks the civic status: national capital wins over regional', () => {
    // Berlin, Hamburg, Vienna and Bremen are BOTH — which is why the schema has
    // two booleans. The Status line names the higher rank only; the regional
    // half is carried by the "Capital of" row, so nothing is lost.
    render(
      <MemoryRouter>
        <CityOverviewTab
          city={
            {
              ...base,
              is_capital: true,
              is_regional_capital: true,
              capital_of_region: 'Berlin',
            } as never
          }
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Capital city')).toBeInTheDocument();
    expect(screen.queryByText('Regional capital')).not.toBeInTheDocument();
    expect(screen.getByText('Capital of')).toBeInTheDocument();
  });

  it('shows a regional capital and the unit it is the capital of', () => {
    render(
      <MemoryRouter>
        <CityOverviewTab
          city={
            {
              ...base,
              name: 'Munich',
              is_capital: false,
              is_regional_capital: true,
              capital_of_region: 'Bavaria',
              region_name: 'Bavaria',
            } as never
          }
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Regional capital')).toBeInTheDocument();
    expect(screen.getByText('Capital of')).toBeInTheDocument();
    expect(screen.getAllByText('Bavaria').length).toBe(2);
  });

  it('a regional capital with no resolved unit still reports its status', () => {
    // The SPARQL label service echoes the QID when there is no English label.
    // pickCapitals keeps the flag and drops the name, so the row must not
    // render an empty "Capital of".
    render(
      <MemoryRouter>
        <CityOverviewTab
          city={{ ...base, is_regional_capital: true, capital_of_region: null } as never}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Regional capital')).toBeInTheDocument();
    expect(screen.queryByText('Capital of')).not.toBeInTheDocument();
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
