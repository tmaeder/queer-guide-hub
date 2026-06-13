/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/weather/WeatherForecast', () => ({ WeatherForecast: () => <div>weather</div> }));

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
