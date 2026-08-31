/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Candidate } from '@/lib/itinerary/generateItinerary';

/**
 * The generator itself and the two plan helpers are pure and tested directly
 * (`src/lib/itinerary/__tests__`). What is left here is the wiring — the
 * branches a reader actually meets when something is missing:
 *
 *   - no dates yet          → say what to do, do not render a dead panel
 *   - the pool failed       → say so, do not render pickers over nothing
 *   - too little to work on → the real count, not an empty plan
 *   - an unfillable slot    → the gap is RENDERED, with its reason
 *
 * That last one is the whole design. `generateItinerary` never pads, so if this
 * component quietly dropped empty slots the honesty would die in the UI while
 * every unit test still passed.
 */

const { poolMock, needsMock, prefsMock, bulkMutate, toastMock } = vi.hoisted(() => ({
  poolMock: vi.fn(),
  needsMock: vi.fn(),
  prefsMock: vi.fn(),
  bulkMutate: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/hooks/useItineraryPool', () => ({ useItineraryPool: poolMock }));
vi.mock('@/hooks/useAccessibilityMatches', () => ({ useAccessibilityNeeds: needsMock }));
vi.mock('@/hooks/useUserTravelPreferences', () => ({ useUserTravelPreferences: prefsMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ addPlacesBulk: { mutateAsync: bulkMutate } }),
}));

import { ItineraryGenerator } from '../ItineraryGenerator';

const CITY = 'city-1';

let n = 0;
function venue(over: Partial<Candidate> = {}): Candidate {
  n += 1;
  return {
    kind: 'venue',
    id: `v${n}`,
    name: `Venue ${n}`,
    slug: `venue-${n}`,
    cityId: CITY,
    countryId: 'country-1',
    latitude: 52.5 + n * 0.001,
    longitude: 13.4,
    category: 'bar',
    subtype: null,
    dayPart: ['morning', 'afternoon', 'evening', 'night'],
    dayPartKnown: true,
    tags: [],
    accessibilityAttributes: [],
    amenities: [],
    priceLevel: null,
    isFree: null,
    qualityScore: 70,
    rating: null,
    imageUrl: null,
    startsAt: null,
    endsAt: null,
    venueId: null,
    ...over,
  };
}

/** Minimal trip shape — the component reads days, city stops and members. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trip(over: Record<string, unknown> = {}): any {
  return {
    id: 'trip-1',
    primary_city_id: CITY,
    primary_city_name: 'Berlin',
    trip_members: [],
    trip_days: [
      { id: 'day-1', date: '2026-09-01' },
      { id: 'day-2', date: '2026-09-02' },
    ],
    trip_places: [],
    ...over,
  };
}

beforeEach(() => {
  poolMock.mockReset();
  needsMock.mockReset();
  prefsMock.mockReset();
  bulkMutate.mockReset();
  toastMock.mockReset();
  needsMock.mockReturnValue({ data: [] });
  prefsMock.mockReturnValue({ data: null });
  poolMock.mockReturnValue({ data: [], isLoading: false, error: null });
});

describe('ItineraryGenerator', () => {
  it('asks for dates rather than rendering a panel that cannot work', () => {
    render(<ItineraryGenerator trip={trip({ trip_days: [] })} canEdit />);
    expect(screen.getByText(/Set the trip dates/i)).toBeInTheDocument();
  });

  it('says the pool failed instead of showing pickers over nothing', () => {
    poolMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') });
    render(<ItineraryGenerator trip={trip()} canEdit />);
    expect(screen.getByText(/Could not load places/i)).toBeInTheDocument();
  });

  it('reports how little there is rather than an empty plan', () => {
    poolMock.mockReturnValue({ data: [venue()], isLoading: false, error: null });
    render(<ItineraryGenerator trip={trip()} canEdit />);
    expect(screen.getByText(/Not enough to build days from/i)).toBeInTheDocument();
  });

  it('RENDERS an unfillable slot with its reason instead of hiding it', () => {
    // Morning-only venues against a plan that also wants an afternoon and an
    // evening: the generator returns those slots empty, and the point of this
    // component is that the reader is told so.
    poolMock.mockReturnValue({
      data: Array.from({ length: 6 }, () => venue({ dayPart: ['morning'] })),
      isLoading: false,
      error: null,
    });
    render(<ItineraryGenerator trip={trip()} canEdit />);
    expect(screen.getAllByText(/Nothing listed here for this time of day/i).length).toBeGreaterThan(
      0,
    );
  });

  it('states the accessibility denominator when the user has needs', () => {
    needsMock.mockReturnValue({ data: ['wheelchair'] });
    poolMock.mockReturnValue({
      data: Array.from({ length: 8 }, () => venue()),
      isLoading: false,
      error: null,
    });
    render(<ItineraryGenerator trip={trip()} canEdit />);
    // 0 of 8 publish anything — said out loud, never implied as "not accessible".
    expect(screen.getByText(/publish accessibility information/i)).toBeInTheDocument();
  });

  it('says nothing about accessibility coverage when the user set no needs', () => {
    poolMock.mockReturnValue({
      data: Array.from({ length: 8 }, () => venue()),
      isLoading: false,
      error: null,
    });
    render(<ItineraryGenerator trip={trip()} canEdit />);
    expect(screen.queryByText(/publish accessibility information/i)).toBeNull();
  });

  it('applies the plan as trip_places rows on the matching days', async () => {
    poolMock.mockReturnValue({
      data: Array.from({ length: 10 }, () => venue()),
      isLoading: false,
      error: null,
    });
    bulkMutate.mockResolvedValue(undefined);
    render(<ItineraryGenerator trip={trip()} canEdit />);

    fireEvent.click(screen.getByRole('button', { name: /Add .* stops to the trip/i }));
    await waitFor(() => expect(bulkMutate).toHaveBeenCalledTimes(1));

    const { tripId, rows } = bulkMutate.mock.calls[0][0];
    expect(tripId).toBe('trip-1');
    expect(rows.length).toBeGreaterThan(0);
    // Real day ids, a real venue id, and no invented duration.
    for (const row of rows) {
      expect(['day-1', 'day-2']).toContain(row.day_id);
      expect(row.venue_id).toBeTruthy();
      expect(row.duration_minutes).toBeNull();
      expect(row.city_id).toBe(CITY);
    }
  });

  it('offers no apply button to a viewer who cannot edit', () => {
    poolMock.mockReturnValue({
      data: Array.from({ length: 10 }, () => venue()),
      isLoading: false,
      error: null,
    });
    render(<ItineraryGenerator trip={trip()} canEdit={false} />);
    expect(screen.queryByRole('button', { name: /stops to the trip/i })).toBeNull();
    // The plan is still readable, and rerolling writes nothing.
    expect(screen.getByRole('button', { name: /Try another/i })).toBeInTheDocument();
  });

  it('writes nothing until apply is pressed', () => {
    poolMock.mockReturnValue({
      data: Array.from({ length: 10 }, () => venue()),
      isLoading: false,
      error: null,
    });
    render(<ItineraryGenerator trip={trip()} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: /Try another/i }));
    expect(bulkMutate).not.toHaveBeenCalled();
  });
});
