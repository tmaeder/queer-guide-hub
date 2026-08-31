import { describe, expect, it } from 'vitest';
import {
  SLOT_TIME,
  assignDaysToStops,
  itineraryToPlaceRows,
  type DayRow,
  type RouteStop,
} from '../itineraryPlan';
import type { Candidate, ItineraryResult, ItinerarySlot } from '../generateItinerary';

function dayRows(...dates: string[]): DayRow[] {
  return dates.map((date, i) => ({ id: `d${i}`, date }));
}

const BERLIN: RouteStop = { cityId: 'berlin', name: 'Berlin' };
const PRAGUE: RouteStop = { cityId: 'prague', name: 'Prague' };
const VIENNA: RouteStop = { cityId: 'vienna', name: 'Vienna' };

describe('assignDaysToStops', () => {
  it('puts every day in the only city when there is one stop', () => {
    const out = assignDaysToStops(dayRows('2026-09-01', '2026-09-02'), [BERLIN], null);
    expect(out.map((d) => d.cityId)).toEqual(['berlin', 'berlin']);
  });

  it('splits evenly across stops, in route order', () => {
    const out = assignDaysToStops(
      dayRows('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'),
      [BERLIN, PRAGUE],
      null,
    );
    expect(out.map((d) => d.cityId)).toEqual(['berlin', 'berlin', 'prague', 'prague']);
  });

  it('lands the remainder on the last stop, never past the end of the route', () => {
    // 5 days over 2 stops is 3 + 2. Flooring instead of ceiling would index a
    // third stop that does not exist and put the last day nowhere.
    const out = assignDaysToStops(
      dayRows('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'),
      [BERLIN, PRAGUE],
      null,
    );
    expect(out.map((d) => d.cityId)).toEqual(['berlin', 'berlin', 'berlin', 'prague', 'prague']);
    expect(out.every((d) => !!d.cityId)).toBe(true);
  });

  it('never leaves a day without a city, however lopsided the split', () => {
    for (let dayCount = 1; dayCount <= 14; dayCount++) {
      for (const route of [[BERLIN], [BERLIN, PRAGUE], [BERLIN, PRAGUE, VIENNA]]) {
        const dates = Array.from(
          { length: dayCount },
          (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`,
        );
        const out = assignDaysToStops(dayRows(...dates), route, null);
        expect(out).toHaveLength(dayCount);
        expect(out.every((d) => route.some((s) => s.cityId === d.cityId))).toBe(true);
      }
    }
  });

  it('keeps the route order rather than re-sorting it', () => {
    // The stops arrive in the order the line generator put them in
    // geographically. Re-ordering would send the traveller back and forth.
    const out = assignDaysToStops(
      dayRows('2026-09-01', '2026-09-02', '2026-09-03'),
      [VIENNA, BERLIN, PRAGUE],
      null,
    );
    expect(out.map((d) => d.cityId)).toEqual(['vienna', 'berlin', 'prague']);
  });

  it('sorts days by date regardless of the order they arrive in', () => {
    const out = assignDaysToStops(
      [
        { id: 'b', date: '2026-09-03' },
        { id: 'a', date: '2026-09-01' },
        { id: 'c', date: '2026-09-02' },
      ],
      [BERLIN],
      null,
    );
    expect(out.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('falls back to the primary city when the trip has no city stops', () => {
    const out = assignDaysToStops(dayRows('2026-09-01'), [], BERLIN);
    expect(out.map((d) => d.cityId)).toEqual(['berlin']);
  });

  it('returns nothing rather than a day with no city', () => {
    expect(assignDaysToStops(dayRows('2026-09-01'), [], null)).toEqual([]);
    expect(assignDaysToStops([], [BERLIN], null)).toEqual([]);
  });
});

// ── itineraryToPlaceRows ───────────────────────────────────────────────

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    kind: 'venue',
    id: 'v1',
    name: 'Venue',
    slug: 'venue',
    cityId: 'berlin',
    countryId: 'de',
    latitude: 52.5,
    longitude: 13.4,
    category: 'bar',
    subtype: null,
    dayPart: ['evening'],
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

function slot(over: Partial<ItinerarySlot> = {}): ItinerarySlot {
  return {
    dayPart: 'evening',
    candidate: candidate(),
    outcome: 'filled',
    matchedNeeds: [],
    dayPartAssumed: false,
    distanceFromPrevKm: null,
    ...over,
  };
}

function plan(days: ItineraryResult['days']): ItineraryResult {
  return {
    days,
    outcome: 'ok',
    requestedSlots: days.reduce((n, d) => n + d.slots.length, 0),
    filledSlots: days.reduce((n, d) => n + d.slots.filter((s) => s.candidate).length, 0),
    eligibleCount: 10,
    poolSize: 10,
    accessibilityCoverage: { withData: 0, total: 10 },
    budgetCoverage: { withData: 0, total: 10 },
    seed: 1,
  };
}

describe('itineraryToPlaceRows', () => {
  const dayIds = new Map([['2026-09-01', 'day-1']]);

  it('writes a venue id for a venue and an event id for an event, never both', () => {
    const rows = itineraryToPlaceRows(
      plan([
        {
          date: '2026-09-01',
          cityId: 'berlin',
          cityName: 'Berlin',
          slots: [
            slot({ candidate: candidate({ id: 'v9', kind: 'venue' }) }),
            slot({
              dayPart: 'night',
              candidate: candidate({ id: 'e9', kind: 'event' }),
            }),
          ],
        },
      ]),
      dayIds,
    );
    expect(rows[0]).toMatchObject({ venue_id: 'v9', event_id: null, category: 'venue' });
    expect(rows[1]).toMatchObject({ venue_id: null, event_id: 'e9', category: 'event' });
  });

  it('drops empty slots — a gap is told to the reader, not written as a row', () => {
    const rows = itineraryToPlaceRows(
      plan([
        {
          date: '2026-09-01',
          cityId: 'berlin',
          cityName: 'Berlin',
          slots: [
            slot({ dayPart: 'morning', candidate: null, outcome: 'no_candidate' }),
            slot({ dayPart: 'evening' }),
          ],
        },
      ]),
      dayIds,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].start_time).toBe(SLOT_TIME.evening);
  });

  it('gives each slot the start time of its own day part', () => {
    const rows = itineraryToPlaceRows(
      plan([
        {
          date: '2026-09-01',
          cityId: 'berlin',
          cityName: 'Berlin',
          slots: (['morning', 'afternoon', 'evening', 'night'] as const).map((dayPart) =>
            slot({ dayPart, candidate: candidate({ id: `v-${dayPart}` }) }),
          ),
        },
      ]),
      dayIds,
    );
    expect(rows.map((r) => r.start_time)).toEqual([
      SLOT_TIME.morning,
      SLOT_TIME.afternoon,
      SLOT_TIME.evening,
      SLOT_TIME.night,
    ]);
  });

  it('numbers sort_order across the whole plan, not per day', () => {
    // Restarting per day makes every day's first stop tie with every other
    // day's, and the itinerary renders places in this order within their day.
    const rows = itineraryToPlaceRows(
      plan([
        {
          date: '2026-09-01',
          cityId: 'berlin',
          cityName: 'Berlin',
          slots: [slot({ candidate: candidate({ id: 'a' }) })],
        },
        {
          date: '2026-09-02',
          cityId: 'berlin',
          cityName: 'Berlin',
          slots: [slot({ candidate: candidate({ id: 'b' }) })],
        },
      ]),
      dayIds,
    );
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1]);
  });

  it('leaves day_id null rather than guessing when the date has no trip_days row', () => {
    const rows = itineraryToPlaceRows(
      plan([
        {
          date: '2099-01-01',
          cityId: 'berlin',
          cityName: 'Berlin',
          slots: [slot()],
        },
      ]),
      dayIds,
    );
    expect(rows[0].day_id).toBeNull();
  });

  it('never invents a duration', () => {
    // The corpus has no opening hours and no typical visit length. A made-up
    // number would propagate into the leg estimates as though it were measured.
    const rows = itineraryToPlaceRows(
      plan([{ date: '2026-09-01', cityId: 'berlin', cityName: 'Berlin', slots: [slot()] }]),
      dayIds,
    );
    expect(rows[0].duration_minutes).toBeNull();
    expect(rows[0].end_time).toBeNull();
  });
});
