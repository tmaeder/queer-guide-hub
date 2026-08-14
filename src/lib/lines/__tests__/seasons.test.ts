import { describe, expect, it } from 'vitest';
import { availability, isOfferable, seasonWindows, stationHasEventIn } from '../seasons';
import type { Station } from '../generateLine';

function station(over: Partial<Station> = {}): Station {
  return {
    id: 'a',
    name: 'A',
    slug: 'a',
    imageUrl: null,
    description: null,
    safetyNotes: null,
    editorialHook: null,
    latitude: 50,
    longitude: 10,
    timezone: null,
    population: null,
    countryId: 'c',
    countryName: 'C',
    countryCode: 'XX',
    currency: 'EUR',
    equalityScore: 80,
    criminalization: null,
    venueCount: 20,
    nightlifeCount: 10,
    saunaCount: 2,
    cafeCount: 4,
    communityCount: 1,
    outdoorCount: 2,
    shopCount: 1,
    eventCount: 0,
    prideCount: 0,
    nextEventAt: null,
    nextEventTitle: null,
    eventMonths: [],
    villageCount: 0,
    villageName: null,
    ...over,
  };
}

// Mid-August, which is the awkward case: we are standing inside pride season.
const AUG = new Date('2026-08-12T00:00:00Z');

describe('seasonWindows', () => {
  it('returns the four windows in a stable order', () => {
    expect(seasonWindows(AUG).map((w) => w.id)).toEqual(['now', 'autumn', 'winter', 'pride']);
  });

  it('covers this month and next for "now"', () => {
    const now = seasonWindows(AUG).find((w) => w.id === 'now')!;
    expect(now.months).toEqual(['2026-08', '2026-09']);
  });

  it('rolls autumn and winter forward correctly from August', () => {
    const w = seasonWindows(AUG);
    expect(w.find((x) => x.id === 'autumn')!.months).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(w.find((x) => x.id === 'winter')!.months).toEqual(['2026-12', '2027-01', '2027-02']);
  });

  // Offering the pride season we are already halfway through would hand the
  // reader a window that is mostly over; they would pick it, get two stations,
  // and conclude the data is broken rather than that they are late.
  it('offers the NEXT pride season, not the one already under way', () => {
    const pride = seasonWindows(AUG).find((w) => w.id === 'pride')!;
    expect(pride.months).toEqual(['2027-06', '2027-07', '2027-08']);
  });

  it('offers this year’s pride season when it is still ahead', () => {
    const pride = seasonWindows(new Date('2026-03-02T00:00:00Z')).find((w) => w.id === 'pride')!;
    expect(pride.months).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('rolls the year over in December', () => {
    const w = seasonWindows(new Date('2026-12-20T00:00:00Z'));
    expect(w.find((x) => x.id === 'now')!.months).toEqual(['2026-12', '2027-01']);
    expect(w.find((x) => x.id === 'winter')!.months).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(w.find((x) => x.id === 'autumn')!.months).toEqual(['2027-09', '2027-10', '2027-11']);
  });

  it('starts each window on the first of its first month', () => {
    for (const w of seasonWindows(AUG)) {
      expect(w.start.getUTCDate()).toBe(1);
      expect(w.months[0]).toBe(
        `${w.start.getUTCFullYear()}-${String(w.start.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    }
  });
});

describe('stationHasEventIn', () => {
  const now = seasonWindows(AUG).find((w) => w.id === 'now')!;

  it('is true only when a month actually overlaps', () => {
    expect(stationHasEventIn(station({ eventMonths: ['2026-09'] }), now)).toBe(true);
    expect(stationHasEventIn(station({ eventMonths: ['2027-03'] }), now)).toBe(false);
  });

  it('is false with no window and false with no events', () => {
    expect(stationHasEventIn(station({ eventMonths: ['2026-08'] }), null)).toBe(false);
    expect(stationHasEventIn(station({ eventMonths: [] }), now)).toBe(false);
  });
});

describe('availability', () => {
  const now = seasonWindows(AUG).find((w) => w.id === 'now')!;

  it('counts only stations with an event in the window', () => {
    const pool = [
      station({ id: '1', eventMonths: ['2026-08'] }),
      station({ id: '2', eventMonths: ['2027-01'] }),
      station({ id: '3', eventMonths: [] }),
    ];
    expect(availability(pool, now).cities).toBe(1);
  });

  // The number that matters. Twenty events spread over three continents is
  // plenty of events and cannot build a single line.
  it('counts near pairs, not just cities', () => {
    const close = [
      station({ id: '1', latitude: 50, longitude: 10, eventMonths: ['2026-08'] }),
      station({ id: '2', latitude: 51, longitude: 10, eventMonths: ['2026-08'] }),
      station({ id: '3', latitude: 52, longitude: 10, eventMonths: ['2026-08'] }),
    ];
    expect(availability(close, now)).toEqual({ cities: 3, pairs: 3 });

    const scattered = [
      station({ id: '1', latitude: 50, longitude: 10, eventMonths: ['2026-08'] }),
      station({ id: '2', latitude: -33, longitude: 151, eventMonths: ['2026-08'] }),
      station({ id: '3', latitude: 37, longitude: -122, eventMonths: ['2026-08'] }),
    ];
    expect(availability(scattered, now)).toEqual({ cities: 3, pairs: 0 });
  });
});

describe('isOfferable', () => {
  it('needs at least two near pairs to carry a three-stop line', () => {
    expect(isOfferable({ cities: 3, pairs: 3 })).toBe(true);
    expect(isOfferable({ cities: 3, pairs: 2 })).toBe(true);
    expect(isOfferable({ cities: 12, pairs: 1 })).toBe(false);
    expect(isOfferable({ cities: 16, pairs: 0 })).toBe(false);
  });
});
