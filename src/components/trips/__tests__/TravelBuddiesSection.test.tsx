/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TripWithDetails } from '@/hooks/useTrips';

const { useTripSafetyMock } = vi.hoisted(() => ({ useTripSafetyMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useTripSafety', () => ({ useTripSafety: useTripSafetyMock }));
vi.mock('@/components/people/PeopleHereRail', () => ({
  PeopleHereRail: ({ title }: { title: string }) => <div data-testid="rail">{title}</div>,
}));

import { TravelBuddiesSection } from '../TravelBuddiesSection';

const trip = {
  id: 't1',
  primary_country_id: 'co1',
  trip_places: [{ country_id: 'co2' }],
} as unknown as TripWithDetails;

function report(over: Partial<{ crim: boolean; death: boolean }> = {}) {
  return {
    countries: [],
    crossBorderWarnings: [],
    overallRisk: 'low' as const,
    hasCriminalizedDestination: over.crim ?? false,
    hasDeathPenaltyDestination: over.death ?? false,
  };
}

describe('TravelBuddiesSection', () => {
  beforeEach(() => useTripSafetyMock.mockReset());

  it('renders the travel rail for a safe destination', () => {
    useTripSafetyMock.mockReturnValue(report());
    render(<TravelBuddiesSection trip={trip} />);
    expect(screen.getByTestId('rail')).toBeInTheDocument();
  });

  it('suppresses the rail for a criminalizing destination', () => {
    useTripSafetyMock.mockReturnValue(report({ crim: true }));
    const { container } = render(<TravelBuddiesSection trip={trip} />);
    expect(screen.queryByTestId('rail')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('suppresses the rail for a death-penalty destination', () => {
    useTripSafetyMock.mockReturnValue(report({ death: true }));
    render(<TravelBuddiesSection trip={trip} />);
    expect(screen.queryByTestId('rail')).not.toBeInTheDocument();
  });

  it('passes the trip country ids (primary + places) to useTripSafety', () => {
    useTripSafetyMock.mockReturnValue(report());
    render(<TravelBuddiesSection trip={trip} />);
    expect(useTripSafetyMock).toHaveBeenCalledWith(expect.arrayContaining(['co1', 'co2']));
  });
});
