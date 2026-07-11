/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/hub/calendar/useCalendarItems', () => ({
  useCalendarItems: () => ({ items: [], byDay: new Map(), loading: false }),
}));
vi.mock('@/hooks/useCalendarFeed', () => ({
  useCalendarFeed: () => ({ copyCalendarFeedUrl: vi.fn(), loading: false }),
}));
vi.mock('@/components/hub/TripsStrip', () => ({
  TripsStrip: () => <div data-testid="trips-strip" />,
}));

import { PlansModule } from '../../modules/PlansModule';

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <PlansModule />
    </MemoryRouter>,
  );

describe('PlansModule (unified calendar)', () => {
  it('defaults to the month view with a grid', () => {
    renderAt('/hub/plans');
    expect(screen.getByRole('grid')).toBeTruthy();
    expect(screen.getAllByRole('gridcell').length).toBeGreaterThanOrEqual(35);
  });

  it('renders the day view for ?view=day&date=2026-07-15', () => {
    renderAt('/hub/plans?view=day&date=2026-07-15');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByText('Nothing on this day.')).toBeTruthy();
  });

  it('auto-opens the trips drawer when a /travel ?cityId seed is present', () => {
    renderAt('/hub/plans?cityId=c1&cityName=Berlin&countryId=x&countryName=Germany');
    expect(screen.getByTestId('trips-strip')).toBeTruthy();
  });

  it('does not open the trips drawer without a seed', () => {
    renderAt('/hub/plans');
    expect(screen.queryByTestId('trips-strip')).toBeNull();
  });

  it('opens the trips drawer from the toolbar button', () => {
    renderAt('/hub/plans');
    fireEvent.click(screen.getByRole('button', { name: 'Trips' }));
    expect(screen.getByTestId('trips-strip')).toBeTruthy();
  });
});
