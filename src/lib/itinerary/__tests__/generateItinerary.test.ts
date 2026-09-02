import { describe, expect, it } from 'vitest';
import {
  DAY_PARTS,
  generateItinerary,
  slotsForDay,
  type Candidate,
  type GenerateItineraryInput,
} from '../generateItinerary';

/**
 * A synthetic pool with flat coordinates, so a failure points at the ranking
 * rather than at real-world geography. Every venue sits within a few hundred
 * metres of the next, which makes the proximity term a tiebreak here instead of
 * a driver — the terms under test are the ones being tested.
 */
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
    dayPart: ['evening', 'night'],
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

function event(date: string, over: Partial<Candidate> = {}): Candidate {
  return venue({
    kind: 'event',
    category: 'pride',
    startsAt: `${date}T20:00:00.000Z`,
    endsAt: null,
    dayPart: ['evening'],
    dayPartKnown: true,
    ...over,
  });
}

const DAY_A = { date: '2026-09-01', cityId: CITY, cityName: 'Berlin' };
const DAY_B = { date: '2026-09-02', cityId: CITY, cityName: 'Berlin' };

function input(over: Partial<GenerateItineraryInput> = {}): GenerateItineraryInput {
  return {
    days: [DAY_A],
    vibe: null,
    pace: 'steady',
    budget: null,
    accessibilityNeeds: [],
    group: 'solo',
    seed: 1,
    ...over,
  };
}

describe('slotsForDay', () => {
  it('gives a slow nightlife day the evening and the night, not the morning', () => {
    // The bug this pins: taking the first N of a fixed chronological ladder
    // hands the most-picked vibe its two worst slots.
    expect(slotsForDay('nightlife', 'slow')).toEqual(['evening', 'night']);
  });

  it('gives a slow slow-vibe day the morning and the afternoon', () => {
    expect(slotsForDay('slow', 'slow')).toEqual(['morning', 'afternoon']);
  });

  it('always returns slots in chronological order', () => {
    for (const vibe of ['nightlife', 'sauna', 'slow', 'community', 'outdoors'] as const) {
      for (const pace of ['slow', 'steady', 'sprint'] as const) {
        const slots = slotsForDay(vibe, pace);
        const positions = slots.map((s) => DAY_PARTS.indexOf(s));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    }
  });

  it('scales with pace', () => {
    expect(slotsForDay(null, 'slow')).toHaveLength(2);
    expect(slotsForDay(null, 'steady')).toHaveLength(3);
    expect(slotsForDay(null, 'sprint')).toHaveLength(4);
  });
});

describe('generateItinerary — determinism', () => {
  const pool = Array.from({ length: 12 }, () =>
    venue({ dayPart: [...DAY_PARTS], dayPartKnown: true }),
  );

  it('is a pure function of (pool, input)', () => {
    const a = generateItinerary(pool, input({ seed: 42 }));
    const b = generateItinerary(pool, input({ seed: 42 }));
    expect(a.days[0].slots.map((s) => s.candidate?.id)).toEqual(
      b.days[0].slots.map((s) => s.candidate?.id),
    );
  });

  it('rerolls on a seed bump', () => {
    // Not asserted per-seed — a tiebreak may legitimately land the same way.
    // Asserted over a spread, which is what "a reroll rerolls" means.
    const picks = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        generateItinerary(pool, input({ seed }))
          .days[0].slots.map((s) => s.candidate?.id)
          .join('|'),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('generateItinerary — it never pads', () => {
  it('leaves a slot empty rather than reaching for an ineligible venue', () => {
    // Six morning-only venues, and a nightlife plan that wants evening+night.
    const pool = Array.from({ length: 6 }, () =>
      venue({ category: 'cafe', dayPart: ['morning'], dayPartKnown: true }),
    );
    const res = generateItinerary(pool, input({ vibe: 'nightlife', pace: 'slow' }));
    expect(res.days[0].slots.every((s) => s.candidate === null)).toBe(true);
    expect(res.outcome).toBe('too_few_candidates');
  });

  it('distinguishes "nothing eligible" from "used earlier in the trip"', () => {
    // Exactly one evening venue and two days that both want an evening.
    const pool = [
      venue({ dayPart: ['evening'], dayPartKnown: true }),
      ...Array.from({ length: 5 }, () =>
        venue({ category: 'cafe', dayPart: ['morning'], dayPartKnown: true }),
      ),
    ];
    const res = generateItinerary(pool, input({ days: [DAY_A, DAY_B], vibe: null, pace: 'slow' }));
    const eveningA = res.days[0].slots.find((s) => s.dayPart === 'evening');
    const eveningB = res.days[1].slots.find((s) => s.dayPart === 'evening');
    expect(eveningA?.outcome).toBe('filled');
    // Day two: it WAS eligible, day one took it. That is not the same as
    // "this city has no evenings", and the reader is told which.
    expect(eveningB?.outcome).toBe('exhausted');
    expect(eveningB?.candidate).toBeNull();
  });

  it('never suggests the same place twice across the trip', () => {
    const pool = Array.from({ length: 20 }, () =>
      venue({ dayPart: [...DAY_PARTS], dayPartKnown: true }),
    );
    const res = generateItinerary(pool, input({ days: [DAY_A, DAY_B], pace: 'sprint' }));
    const ids = res.days.flatMap((d) => d.slots.map((s) => s.candidate?.id)).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generateItinerary — events are the day’s fixed point', () => {
  const filler = Array.from({ length: 10 }, () =>
    venue({ dayPart: [...DAY_PARTS], dayPartKnown: true, qualityScore: 100 }),
  );

  it('an event outranks even a perfect venue in its own slot', () => {
    const e = event(DAY_A.date, { id: 'the-event', qualityScore: 10 });
    const res = generateItinerary([...filler, e], input({ pace: 'steady' }));
    const evening = res.days[0].slots.find((s) => s.dayPart === 'evening');
    expect(evening?.candidate?.id).toBe('the-event');
  });

  it('an event never appears on a day that is not its own', () => {
    const e = event(DAY_B.date, { id: 'the-event' });
    const res = generateItinerary([...filler, e], input({ days: [DAY_A, DAY_B], pace: 'steady' }));
    expect(res.days[0].slots.some((s) => s.candidate?.id === 'the-event')).toBe(false);
    expect(res.days[1].slots.some((s) => s.candidate?.id === 'the-event')).toBe(true);
  });

  it('keeps an event even when the vibe would exclude its category', () => {
    // A vibe narrows venues. It must not narrow a dated event — the traveller
    // is in the city that day either way, and event_type is free text.
    const e = event(DAY_A.date, { id: 'the-event', category: 'community-brunch' });
    const bars = Array.from({ length: 8 }, () =>
      venue({ category: 'bar', dayPart: ['evening', 'night'], dayPartKnown: true }),
    );
    const res = generateItinerary([...bars, e], input({ vibe: 'nightlife', pace: 'slow' }));
    expect(res.days[0].slots.some((s) => s.candidate?.id === 'the-event')).toBe(true);
  });
});

describe('generateItinerary — what it refuses to pretend it knows', () => {
  /**
   * Both contenders are eligible for the SAME slot, and the other slot has its
   * own filler.
   *
   * The first draft of these two tests did not do that: it gave the assumed
   * candidate all four day parts, so the afternoon slot consumed it before the
   * evening was contested at all, and the evening was then won by the only
   * remaining row. Both tests passed with the ranking term deleted entirely —
   * they were asserting the slot loop, not the score. Mutation testing is the
   * only reason that was caught.
   */
  it('ranks a known day part above a permissive default in the same slot', () => {
    const known = venue({
      id: 'known',
      dayPart: ['evening'],
      dayPartKnown: true,
      qualityScore: 60,
    });
    const assumed = venue({
      id: 'assumed',
      category: 'other',
      dayPart: ['evening'],
      dayPartKnown: false,
      qualityScore: 60,
    });
    const afternoonFiller = Array.from({ length: 4 }, () =>
      venue({ dayPart: ['afternoon'], dayPartKnown: true }),
    );
    const res = generateItinerary([known, assumed, ...afternoonFiller], input({ pace: 'slow' }));
    const evening = res.days[0].slots.find((s) => s.dayPart === 'evening');
    expect(evening?.candidate?.id).toBe('known');
  });

  it('does not let quality buy a venue past an unknown time of day', () => {
    // The margin is the point: a perfect-scoring venue whose day part is a
    // default must still lose to a WORTHLESS one whose day part is a signal.
    // Without it, "we do not know when to visit" competes on popularity and
    // fills evenings with shops.
    const known = venue({
      id: 'known',
      dayPart: ['evening'],
      dayPartKnown: true,
      qualityScore: 0,
      rating: null,
    });
    const assumed = venue({
      id: 'assumed',
      category: 'other',
      dayPart: ['evening'],
      dayPartKnown: false,
      qualityScore: 100,
      rating: 10,
    });
    const afternoonFiller = Array.from({ length: 4 }, () =>
      venue({ dayPart: ['afternoon'], dayPartKnown: true }),
    );
    const res = generateItinerary([known, assumed, ...afternoonFiller], input({ pace: 'slow' }));
    const evening = res.days[0].slots.find((s) => s.dayPart === 'evening');
    expect(evening?.candidate?.id).toBe('known');
  });

  it('prefers the nearer of two equal candidates to the previous stop', () => {
    // A day that crosses the city four times is not a plan. Equal on every
    // other term, so only the proximity decay can separate them.
    const anchor = venue({
      id: 'anchor',
      dayPart: ['afternoon'],
      dayPartKnown: true,
      qualityScore: 100,
    });
    const near = venue({
      id: 'near',
      dayPart: ['evening'],
      dayPartKnown: true,
      qualityScore: 70,
      latitude: anchor.latitude + 0.002,
      longitude: anchor.longitude,
    });
    const far = venue({
      id: 'far',
      dayPart: ['evening'],
      dayPartKnown: true,
      qualityScore: 70,
      latitude: anchor.latitude + 0.15,
      longitude: anchor.longitude,
    });
    const res = generateItinerary(
      [anchor, near, far, ...Array.from({ length: 3 }, () => venue({ dayPart: ['morning'] }))],
      input({ pace: 'slow' }),
    );
    expect(res.days[0].slots.find((s) => s.dayPart === 'afternoon')?.candidate?.id).toBe('anchor');
    expect(res.days[0].slots.find((s) => s.dayPart === 'evening')?.candidate?.id).toBe('near');
  });

  it('marks a slot filled from a default day part as assumed', () => {
    const pool = Array.from({ length: 6 }, () =>
      venue({ category: 'other', dayPart: [...DAY_PARTS], dayPartKnown: false }),
    );
    const res = generateItinerary(pool, input({ pace: 'slow' }));
    expect(res.days[0].slots.every((s) => s.dayPartAssumed)).toBe(true);
  });

  it('never drops a venue for not publishing accessibility data', () => {
    // 6 of 25,178 live venues publish anything. A need used as a FILTER would
    // empty the pool and present that as "nowhere here is accessible".
    const pool = Array.from({ length: 8 }, () =>
      venue({ dayPart: [...DAY_PARTS], dayPartKnown: true, accessibilityAttributes: [] }),
    );
    const res = generateItinerary(pool, input({ accessibilityNeeds: ['wheelchair'] }));
    expect(res.filledSlots).toBe(res.requestedSlots);
    expect(res.accessibilityCoverage).toEqual({ withData: 0, total: 8 });
  });

  it('ranks a matching venue up and reports which need it matched', () => {
    const match = venue({
      id: 'step-free',
      dayPart: [...DAY_PARTS],
      dayPartKnown: true,
      accessibilityAttributes: ['step-free-entrance'],
      qualityScore: 60,
    });
    const rest = Array.from({ length: 8 }, () =>
      venue({ dayPart: [...DAY_PARTS], dayPartKnown: true, qualityScore: 60 }),
    );
    const res = generateItinerary([match, ...rest], input({ accessibilityNeeds: ['mobility'] }));
    const slot = res.days[0].slots.find((s) => s.candidate?.id === 'step-free');
    expect(slot).toBeDefined();
    expect(slot?.matchedNeeds).toEqual(['mobility']);
  });

  it('never drops a venue for having no price data', () => {
    // price_range is non-null on 564 of 25,178 live rows, 562 of them bars.
    const pool = Array.from({ length: 8 }, () =>
      venue({ dayPart: [...DAY_PARTS], dayPartKnown: true, priceLevel: null }),
    );
    const res = generateItinerary(pool, input({ budget: 'budget' }));
    expect(res.filledSlots).toBe(res.requestedSlots);
    expect(res.budgetCoverage).toEqual({ withData: 0, total: 8 });
  });
});

describe('generateItinerary — reporting', () => {
  it('reports partial rather than claiming a complete plan', () => {
    const pool = [
      ...Array.from({ length: 5 }, () => venue({ dayPart: ['evening'], dayPartKnown: true })),
    ];
    const res = generateItinerary(pool, input({ pace: 'sprint' }));
    expect(res.outcome).toBe('partial');
    expect(res.filledSlots).toBeLessThan(res.requestedSlots);
  });

  it('counts every requested slot, including the empty ones', () => {
    const pool = Array.from({ length: 8 }, () =>
      venue({ dayPart: [...DAY_PARTS], dayPartKnown: true }),
    );
    const res = generateItinerary(pool, input({ days: [DAY_A, DAY_B], pace: 'steady' }));
    expect(res.requestedSlots).toBe(6);
    expect(res.days.flatMap((d) => d.slots)).toHaveLength(6);
  });

  it('does not leak candidates from another city into a day', () => {
    const here = Array.from({ length: 6 }, () =>
      venue({ dayPart: [...DAY_PARTS], dayPartKnown: true }),
    );
    const elsewhere = Array.from({ length: 6 }, () =>
      venue({ cityId: 'city-2', dayPart: [...DAY_PARTS], dayPartKnown: true, qualityScore: 100 }),
    );
    const res = generateItinerary([...here, ...elsewhere], input());
    const ids = res.days[0].slots.map((s) => s.candidate?.cityId).filter(Boolean);
    expect(ids.every((c) => c === CITY)).toBe(true);
  });

  it('honours excludeIds so a place already on the trip is not re-suggested', () => {
    const pool = Array.from({ length: 8 }, () =>
      venue({ dayPart: [...DAY_PARTS], dayPartKnown: true }),
    );
    const banned = pool[0].id;
    const res = generateItinerary(pool, input({ excludeIds: [banned] }));
    expect(res.days[0].slots.some((s) => s.candidate?.id === banned)).toBe(false);
  });
});
