/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/weather/WeatherForecast', () => ({ WeatherForecast: () => <div>weather</div> }));
// The people rail has its own hook stack (auth/presence/discovery) + spec; stub it here.
vi.mock('@/components/people/PeopleHereRail', () => ({ PeopleHereRail: () => null }));

import { CityOverviewTab } from '../CityOverviewTab';

describe('CityOverviewTab', () => {
  it('renders the description and city facts', () => {
    render(
      <MemoryRouter>
        <CityOverviewTab
          city={
            {
              id: 'c1',
              name: 'Berlin',
              description: 'A creative capital.',
              timezone: 'CET',
              economy_sectors: ['Tech'],
            } as never
          }
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/A creative capital/)).toBeInTheDocument();
    expect(screen.getByText('Timezone')).toBeInTheDocument();
    expect(screen.getByText('Tech')).toBeInTheDocument();
  });
});
