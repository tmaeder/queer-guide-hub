/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { CityOverviewTab } from '../CityOverviewTab';

describe('CityOverviewTab', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <CityOverviewTab
          city={{ id: 'c1', name: 'Berlin' } as never}
          villages={[]} villagesLoading={false} hasAirport={false} effectiveIata={null} nearestAirport={null}
        />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
