/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { getTripViewFromSearch, TripViewSwitcher } from '../TripViewSwitcher';

describe('TripViewSwitcher', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <TripViewSwitcher current="plan" />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('lets an explicit Plan view override a live-trip Today default', () => {
    expect(getTripViewFromSearch(new URLSearchParams('view=plan'), 'today')).toBe('plan');
  });
});
