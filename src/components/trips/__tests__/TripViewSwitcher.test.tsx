/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { getTripViewFromSearch, TripViewSwitcher } from '../TripViewSwitcher';

describe('TripViewSwitcher', () => {
  it('shows one navigation row with contextual Today and no print destination', () => {
    render(
      <MemoryRouter>
        <TripViewSwitcher current="plan" showToday />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Itinerary' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Today' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /booklet/i })).toBeNull();
  });

  it('lets an explicit Plan view override a live-trip Today default', () => {
    expect(getTripViewFromSearch(new URLSearchParams('view=plan'), 'today')).toBe('plan');
  });
});
