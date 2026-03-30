import { describe, it, expect } from 'vitest';
import {
  getLocalHour,
  getLocalMinute,
  getLocalDayOfWeek,
  getLocalDateKey,
  normalizeAddress,
  haversineDistance,
  checkTimeWindow,
  checkDayOfWeek,
  checkTimeOrder,
  findTimePlaceDuplicates,
  classifyDuplicatePair,
  pickPrimary,
  computeMergeChanges,
  extractStreet,
  findDuplicateAddressVenues,
  findSimilarNameSameStreetVenues,
  type EventRecord,
  type VenueRecord,
} from '../event-validation-rules';

// ── Helper to build EventRecord with defaults ────────────────────────────────

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'evt-1',
    title: 'Test Event',
    event_type: 'party',
    start_date: '2026-06-14T20:00:00Z',
    end_date: null,
    timezone: null,
    venue_id: null,
    venue_name: null,
    address: null,
    latitude: null,
    longitude: null,
    city: 'Berlin',
    city_id: null,
    country_id: null,
    status: 'active',
    ...overrides,
  };
}

// ── getLocalHour ─────────────────────────────────────────────────────────────

describe('getLocalHour', () => {
  it('returns UTC hour when timezone is UTC', () => {
    expect(getLocalHour('2026-06-14T14:00:00Z', 'UTC')).toBe(14);
  });

  it('returns 0 for midnight UTC', () => {
    expect(getLocalHour('2026-06-14T00:00:00Z', 'UTC')).toBe(0);
  });

  it('converts to local timezone (Europe/Berlin = UTC+2 in summer)', () => {
    // 14:00 UTC = 16:00 CEST
    expect(getLocalHour('2026-06-14T14:00:00Z', 'Europe/Berlin')).toBe(16);
  });

  it('converts to US Eastern (UTC-4 in summer)', () => {
    // 23:30 UTC = 19:30 EDT
    expect(getLocalHour('2026-06-14T23:30:00Z', 'America/New_York')).toBe(19);
  });

  it('falls back to system locale for invalid timezone', () => {
    // Invalid timezone is ignored; result depends on system locale, just verify it returns a number
    const hour = getLocalHour('2026-06-14T14:00:00Z', 'Invalid/Timezone');
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });
});

// ── getLocalMinute ───────────────────────────────────────────────────────────

describe('getLocalMinute', () => {
  it('returns minute portion', () => {
    expect(getLocalMinute('2026-06-14T14:30:00Z', null)).toBe(30);
  });

  it('returns 0 for on-the-hour', () => {
    expect(getLocalMinute('2026-06-14T14:00:00Z', null)).toBe(0);
  });

  it('handles timezone offset affecting minutes (India UTC+5:30)', () => {
    // 14:00 UTC = 19:30 IST
    expect(getLocalMinute('2026-06-14T14:00:00Z', 'Asia/Kolkata')).toBe(30);
  });
});

// ── getLocalDayOfWeek ────────────────────────────────────────────────────────

describe('getLocalDayOfWeek', () => {
  it('returns Saturday (6) for a known Saturday in UTC', () => {
    // 2026-06-13 is a Saturday
    expect(getLocalDayOfWeek('2026-06-13T12:00:00Z', null)).toBe(6);
  });

  it('returns Sunday (0) for a known Sunday', () => {
    // 2026-06-14 is a Sunday
    expect(getLocalDayOfWeek('2026-06-14T12:00:00Z', null)).toBe(0);
  });

  it('handles timezone crossing midnight (Friday UTC -> Saturday Berlin)', () => {
    // 2026-06-12 is a Friday in UTC
    // 22:00 UTC on Friday = 00:00 CEST on Saturday (June 13)
    expect(getLocalDayOfWeek('2026-06-12T22:00:00Z', 'Europe/Berlin')).toBe(6);
  });

  it('handles timezone crossing back (Saturday UTC -> Friday US)', () => {
    // 2026-06-13 00:00 UTC Saturday = 2026-06-12 20:00 EDT (Friday)
    expect(getLocalDayOfWeek('2026-06-13T00:00:00Z', 'America/New_York')).toBe(5);
  });
});

// ── getLocalDateKey ──────────────────────────────────────────────────────────

describe('getLocalDateKey', () => {
  it('returns YYYY-MM-DD in UTC', () => {
    expect(getLocalDateKey('2026-06-14T14:00:00Z', null)).toBe('2026-06-14');
  });

  it('handles date rollover with timezone', () => {
    // 23:00 UTC June 14 = 01:00 CEST June 15 in Berlin
    expect(getLocalDateKey('2026-06-14T23:00:00Z', 'Europe/Berlin')).toBe('2026-06-15');
  });
});

// ── normalizeAddress ─────────────────────────────────────────────────────────

describe('normalizeAddress', () => {
  it('returns null for null input', () => {
    expect(normalizeAddress(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeAddress('  ')).toBeNull();
  });

  it('lowercases and trims', () => {
    expect(normalizeAddress('  123 Main Street  ')).toBe('123 main street');
  });

  it('removes punctuation', () => {
    expect(normalizeAddress('123 Main St., Apt. 4')).toBe('123 main street apt 4');
  });

  it('expands abbreviations', () => {
    expect(normalizeAddress('45 Oak Ave')).toBe('45 oak avenue');
    expect(normalizeAddress('10 Elm Blvd')).toBe('10 elm boulevard');
  });

  it('normalizes whitespace', () => {
    expect(normalizeAddress('123   Main    St')).toBe('123 main street');
  });
});

// ── haversineDistance ─────────────────────────────────────────────────────────

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(47.3769, 8.5417, 47.3769, 8.5417)).toBe(0);
  });

  it('computes known distance Zurich-Bern (~95km)', () => {
    const dist = haversineDistance(47.3769, 8.5417, 46.948, 7.4474);
    expect(dist).toBeGreaterThan(90_000);
    expect(dist).toBeLessThan(100_000);
  });

  it('detects nearby points within 50m', () => {
    // ~30m apart
    const dist = haversineDistance(52.52, 13.405, 52.5203, 13.405);
    expect(dist).toBeLessThan(50);
    expect(dist).toBeGreaterThan(20);
  });
});

// ── checkTimeWindow (Pride / Rally) ──────────────────────────────────────────

describe('checkTimeWindow — rally (pride demo)', () => {
  const config = { event_types: ['rally'], min_hour: 10, max_hour: 15 };
  const ruleId = 'rule-1';
  const ruleName = 'pride_demo_time_window';

  it('returns null for non-rally event', () => {
    const ev = makeEvent({ event_type: 'party', start_date: '2026-06-14T08:00:00Z' });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('returns null for rally at 10:00 (inclusive lower bound)', () => {
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-14T10:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('returns null for rally at 15:00 (inclusive upper bound)', () => {
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-14T15:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('returns null for rally at 12:30', () => {
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-14T12:30:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('flags rally at 09:59', () => {
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-14T09:59:00Z',
      timezone: 'UTC',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.action).toBe('flag');
    expect(issue!.details.local_hour).toBe(9);
    expect(issue!.details.local_minute).toBe(59);
  });

  it('flags rally at 15:01', () => {
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-14T15:01:00Z',
      timezone: 'UTC',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.action).toBe('flag');
    expect(issue!.details.local_hour).toBe(15);
  });

  it('respects timezone: 08:00 UTC = 10:00 CEST (Berlin) -> OK', () => {
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-14T08:00:00Z',
      timezone: 'Europe/Berlin',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('respects timezone: 08:00 UTC = 04:00 EDT (New York) -> flag', () => {
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-14T08:00:00Z',
      timezone: 'America/New_York',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.details.local_hour).toBe(4);
  });
});

// ── checkTimeWindow (Party) ──────────────────────────────────────────────────

describe('checkTimeWindow — party', () => {
  const config = { event_types: ['party'], min_hour: 18, max_hour: 23 };
  const ruleId = 'rule-4';
  const ruleName = 'party_start_time_window';

  it('returns null for party at 20:00', () => {
    const ev = makeEvent({
      event_type: 'party',
      start_date: '2026-06-14T20:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('returns null for party at 18:00 (inclusive)', () => {
    const ev = makeEvent({
      event_type: 'party',
      start_date: '2026-06-14T18:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('returns null for party at 23:00 (inclusive)', () => {
    const ev = makeEvent({
      event_type: 'party',
      start_date: '2026-06-14T23:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('flags party at 17:59', () => {
    const ev = makeEvent({
      event_type: 'party',
      start_date: '2026-06-14T17:59:00Z',
      timezone: 'UTC',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.details.local_hour).toBe(17);
  });

  it('flags party at 14:00 (afternoon)', () => {
    const ev = makeEvent({
      event_type: 'party',
      start_date: '2026-06-14T14:00:00Z',
      timezone: 'UTC',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
  });

  it('flags party at 23:01', () => {
    const ev = makeEvent({
      event_type: 'party',
      start_date: '2026-06-14T23:01:00Z',
      timezone: 'UTC',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
  });

  it('skips non-party events', () => {
    const ev = makeEvent({
      event_type: 'workshop',
      start_date: '2026-06-14T08:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('respects timezone for party time', () => {
    // 16:00 UTC = 18:00 CEST (Berlin) -> OK
    const ev = makeEvent({
      event_type: 'party',
      start_date: '2026-06-14T16:00:00Z',
      timezone: 'Europe/Berlin',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });
});

// ── checkDayOfWeek ───────────────────────────────────────────────────────────

describe('checkDayOfWeek', () => {
  const config = { event_types: ['rally'], expected_day: 6 }; // Saturday
  const ruleId = 'rule-2';
  const ruleName = 'pride_demo_saturday';

  it('returns null for rally on Saturday', () => {
    // 2026-06-13 is Saturday
    const ev = makeEvent({ event_type: 'rally', start_date: '2026-06-13T12:00:00Z' });
    expect(checkDayOfWeek(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('flags rally on Friday', () => {
    // 2026-06-12 is Friday
    const ev = makeEvent({ event_type: 'rally', start_date: '2026-06-12T12:00:00Z' });
    const issue = checkDayOfWeek(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.details.local_day_name).toBe('Friday');
  });

  it('flags rally on Sunday', () => {
    // 2026-06-14 is Sunday
    const ev = makeEvent({ event_type: 'rally', start_date: '2026-06-14T12:00:00Z' });
    const issue = checkDayOfWeek(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.details.local_day_name).toBe('Sunday');
  });

  it('skips non-rally events', () => {
    const ev = makeEvent({ event_type: 'party', start_date: '2026-06-12T12:00:00Z' });
    expect(checkDayOfWeek(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('handles timezone crossing midnight (Friday UTC -> Saturday Berlin)', () => {
    // 22:00 UTC Friday Jun 12 = 00:00 CEST Saturday Jun 13
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-12T22:00:00Z',
      timezone: 'Europe/Berlin',
    });
    expect(checkDayOfWeek(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('handles timezone crossing back (Saturday UTC -> Friday NY)', () => {
    // 00:00 UTC Saturday Jun 13 = 20:00 EDT Friday Jun 12
    const ev = makeEvent({
      event_type: 'rally',
      start_date: '2026-06-13T00:00:00Z',
      timezone: 'America/New_York',
    });
    const issue = checkDayOfWeek(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.details.local_day_name).toBe('Friday');
  });
});

// ── checkTimeOrder ───────────────────────────────────────────────────────────

describe('checkTimeOrder', () => {
  const ruleId = 'rule-3';
  const ruleName = 'time_order_autofix';

  it('returns null when end > start', () => {
    const ev = makeEvent({
      start_date: '2026-06-14T10:00:00Z',
      end_date: '2026-06-14T12:00:00Z',
    });
    expect(checkTimeOrder(ev, ruleId, ruleName)).toBeNull();
  });

  it('returns null when end_date is null', () => {
    const ev = makeEvent({ end_date: null });
    expect(checkTimeOrder(ev, ruleId, ruleName)).toBeNull();
  });

  it('returns null when start equals end', () => {
    const ev = makeEvent({
      start_date: '2026-06-14T10:00:00Z',
      end_date: '2026-06-14T10:00:00Z',
    });
    expect(checkTimeOrder(ev, ruleId, ruleName)).toBeNull();
  });

  it('returns autofix when end < start', () => {
    const ev = makeEvent({
      start_date: '2026-06-14T15:00:00Z',
      end_date: '2026-06-14T10:00:00Z',
    });
    const issue = checkTimeOrder(ev, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.action).toBe('autofix');
    expect(issue!.suggested_changes).toHaveLength(2);
    expect(issue!.suggested_changes![0]).toEqual({
      field: 'start_date',
      old_value: '2026-06-14T15:00:00Z',
      new_value: '2026-06-14T10:00:00Z',
    });
    expect(issue!.suggested_changes![1]).toEqual({
      field: 'end_date',
      old_value: '2026-06-14T10:00:00Z',
      new_value: '2026-06-14T15:00:00Z',
    });
  });
});

// ── findTimePlaceDuplicates ──────────────────────────────────────────────────

describe('findTimePlaceDuplicates', () => {
  const config = { time_tolerance_min: 10, distance_threshold_m: 50 };

  it('detects duplicates by venue_id within time tolerance', () => {
    const events = [
      makeEvent({ id: 'a', start_date: '2026-06-14T20:00:00Z', venue_id: 'v1', title: 'Party' }),
      makeEvent({ id: 'b', start_date: '2026-06-14T20:05:00Z', venue_id: 'v1', title: 'Party' }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].timeDiffMin).toBe(5);
    expect(pairs[0].distanceM).toBe(0);
  });

  it('skips events beyond time tolerance', () => {
    const events = [
      makeEvent({ id: 'a', start_date: '2026-06-14T20:00:00Z', venue_id: 'v1' }),
      makeEvent({ id: 'b', start_date: '2026-06-14T20:15:00Z', venue_id: 'v1' }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(0);
  });

  it('detects duplicates by same normalized address', () => {
    const events = [
      makeEvent({ id: 'a', start_date: '2026-06-14T20:00:00Z', address: '123 Main St.' }),
      makeEvent({ id: 'b', start_date: '2026-06-14T20:05:00Z', address: '123 Main Street' }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(1);
  });

  it('detects duplicates by geo distance within threshold', () => {
    const events = [
      makeEvent({
        id: 'a',
        start_date: '2026-06-14T20:00:00Z',
        latitude: 52.52,
        longitude: 13.405,
      }),
      makeEvent({
        id: 'b',
        start_date: '2026-06-14T20:05:00Z',
        latitude: 52.5203,
        longitude: 13.405, // ~33m apart
      }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].distanceM!).toBeLessThan(50);
  });

  it('skips events with geo distance beyond threshold', () => {
    const events = [
      makeEvent({
        id: 'a',
        start_date: '2026-06-14T20:00:00Z',
        latitude: 52.52,
        longitude: 13.405,
      }),
      makeEvent({
        id: 'b',
        start_date: '2026-06-14T20:05:00Z',
        latitude: 52.521,
        longitude: 13.405, // ~111m apart
      }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(0);
  });

  it('skips cancelled events', () => {
    const events = [
      makeEvent({
        id: 'a',
        start_date: '2026-06-14T20:00:00Z',
        venue_id: 'v1',
        status: 'cancelled',
      }),
      makeEvent({ id: 'b', start_date: '2026-06-14T20:05:00Z', venue_id: 'v1' }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(0);
  });

  it('does not match events on different days', () => {
    const events = [
      makeEvent({ id: 'a', start_date: '2026-06-14T20:00:00Z', venue_id: 'v1' }),
      makeEvent({ id: 'b', start_date: '2026-06-15T20:05:00Z', venue_id: 'v1' }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(0);
  });

  it('does not match events with no location overlap', () => {
    const events = [
      makeEvent({ id: 'a', start_date: '2026-06-14T20:00:00Z', address: '123 Main St' }),
      makeEvent({ id: 'b', start_date: '2026-06-14T20:05:00Z', address: '456 Oak Ave' }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(0);
  });
});

// ── classifyDuplicatePair ────────────────────────────────────────────────────

describe('classifyDuplicatePair', () => {
  it('returns auto_merge when titles and types match', () => {
    const a = makeEvent({ title: 'Pride March', event_type: 'rally' });
    const b = makeEvent({ title: 'Pride March', event_type: 'rally' });
    const result = classifyDuplicatePair(a, b);
    expect(result.classification).toBe('auto_merge');
    expect(result.confidence.score).toBeGreaterThan(0.85);
    expect(result.titleSimilarity).toBe(1.0);
  });

  it('returns auto_merge case-insensitive title match', () => {
    const a = makeEvent({ title: 'Pride March', event_type: 'rally' });
    const b = makeEvent({ title: 'pride march', event_type: 'rally' });
    const result = classifyDuplicatePair(a, b);
    expect(result.classification).toBe('auto_merge');
  });

  it('returns flag_review when titles differ significantly', () => {
    const a = makeEvent({ title: 'Pride March', event_type: 'rally' });
    const b = makeEvent({ title: 'Pride Parade', event_type: 'rally' });
    const result = classifyDuplicatePair(a, b);
    expect(result.classification).toBe('flag_review');
    expect(result.titleSimilarity).toBeLessThan(0.85);
  });

  it('returns flag_review when types differ', () => {
    const a = makeEvent({ title: 'Pride', event_type: 'rally' });
    const b = makeEvent({ title: 'Pride', event_type: 'festival' });
    const result = classifyDuplicatePair(a, b);
    expect(result.classification).toBe('flag_review');
  });

  it('returns confidence with factors', () => {
    const a = makeEvent({ title: 'Test Event', event_type: 'party' });
    const b = makeEvent({ title: 'Test Event', event_type: 'party' });
    const result = classifyDuplicatePair(a, b);
    expect(result.confidence.factors.length).toBeGreaterThan(0);
    expect(result.confidence.reasoning).toBeTruthy();
  });

  it('handles fuzzy title matches (typos)', () => {
    const a = makeEvent({ title: 'Berghain Party Night', event_type: 'party' });
    const b = makeEvent({ title: 'Berghein Party Night', event_type: 'party' });
    const result = classifyDuplicatePair(a, b);
    expect(result.titleSimilarity).toBeGreaterThan(0.85);
    // Should auto_merge since similarity is high and type matches
    expect(result.classification).toBe('auto_merge');
  });
});

// ── pickPrimary ──────────────────────────────────────────────────────────────

describe('pickPrimary', () => {
  it('picks event with more non-null fields as primary', () => {
    const a = makeEvent({ id: 'a', venue_id: 'v1', address: '123 Main St', timezone: 'UTC' });
    const b = makeEvent({ id: 'b', venue_id: null, address: null });
    const { primary, secondary } = pickPrimary(a, b);
    expect(primary.id).toBe('a');
    expect(secondary.id).toBe('b');
  });

  it('tiebreaks by lower id', () => {
    const a = makeEvent({ id: 'aaa' });
    const b = makeEvent({ id: 'bbb' });
    const { primary } = pickPrimary(a, b);
    expect(primary.id).toBe('aaa');
  });
});

// ── computeMergeChanges ──────────────────────────────────────────────────────

describe('computeMergeChanges', () => {
  it('returns changes for null fields in primary that exist in secondary', () => {
    const primary = makeEvent({ id: 'a', venue_id: null, timezone: null });
    const secondary = makeEvent({ id: 'b', venue_id: 'v1', timezone: 'Europe/Berlin' });
    const changes = computeMergeChanges(primary, secondary);
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: 'venue_id', old_value: null, new_value: 'v1' },
        { field: 'timezone', old_value: null, new_value: 'Europe/Berlin' },
      ]),
    );
  });

  it('returns empty array when primary has all fields', () => {
    const primary = makeEvent({
      id: 'a',
      venue_id: 'v1',
      venue_name: 'Club',
      address: '123 St',
      latitude: 52,
      longitude: 13,
      timezone: 'UTC',
      city_id: 'c1',
      country_id: 'co1',
    });
    const secondary = makeEvent({ id: 'b', venue_id: 'v2' });
    const changes = computeMergeChanges(primary, secondary);
    expect(changes).toHaveLength(0);
  });

  it('does not overwrite existing non-null fields', () => {
    const primary = makeEvent({ id: 'a', venue_id: 'v1' });
    const secondary = makeEvent({ id: 'b', venue_id: 'v2' });
    const changes = computeMergeChanges(primary, secondary);
    const venueChange = changes.find((c) => c.field === 'venue_id');
    expect(venueChange).toBeUndefined();
  });
});

// ── checkTimeWindow — pride (corrected from rally) ──────────────────────────

describe('checkTimeWindow — pride/protest events', () => {
  const config = { event_types: ['pride', 'protest'], min_hour: 10, max_hour: 15 };
  const ruleId = 'rule-pride';
  const ruleName = 'pride_demo_time_window';

  it('returns null for pride event at 12:00', () => {
    const ev = makeEvent({
      event_type: 'pride',
      start_date: '2026-06-14T12:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('flags pride event at 08:00', () => {
    const ev = makeEvent({
      event_type: 'pride',
      start_date: '2026-06-14T08:00:00Z',
      timezone: 'UTC',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.details.local_hour).toBe(8);
  });

  it('flags protest event at 16:00', () => {
    const ev = makeEvent({
      event_type: 'protest',
      start_date: '2026-06-14T16:00:00Z',
      timezone: 'UTC',
    });
    const issue = checkTimeWindow(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
  });

  it('returns null for protest at 10:00 (inclusive lower bound)', () => {
    const ev = makeEvent({
      event_type: 'protest',
      start_date: '2026-06-14T10:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('ignores non-pride/protest event types', () => {
    const ev = makeEvent({
      event_type: 'community',
      start_date: '2026-06-14T08:00:00Z',
      timezone: 'UTC',
    });
    expect(checkTimeWindow(ev, config, ruleId, ruleName)).toBeNull();
  });
});

describe('checkDayOfWeek — pride/protest events', () => {
  const config = { event_types: ['pride', 'protest'], expected_day: 6 };
  const ruleId = 'rule-pride-day';
  const ruleName = 'pride_demo_saturday';

  it('returns null for pride on Saturday', () => {
    const ev = makeEvent({ event_type: 'pride', start_date: '2026-06-13T12:00:00Z' });
    expect(checkDayOfWeek(ev, config, ruleId, ruleName)).toBeNull();
  });

  it('flags protest on Wednesday', () => {
    // 2026-06-10 is Wednesday
    const ev = makeEvent({ event_type: 'protest', start_date: '2026-06-10T12:00:00Z' });
    const issue = checkDayOfWeek(ev, config, ruleId, ruleName);
    expect(issue).not.toBeNull();
    expect(issue!.details.local_day_name).toBe('Wednesday');
  });
});

// ── extractStreet ───────────────────────────────────────────────────────────

describe('extractStreet', () => {
  it('returns null for null/empty input', () => {
    expect(extractStreet(null)).toBeNull();
    expect(extractStreet('')).toBeNull();
    expect(extractStreet('  ')).toBeNull();
  });

  it('extracts street from "123 Main St"', () => {
    expect(extractStreet('123 Main St')).toBe('main street');
  });

  it('extracts street from German format "Hauptstr. 15"', () => {
    expect(extractStreet('Hauptstr. 15')).toBe('hauptstrasse');
  });

  it('takes only first line (before comma)', () => {
    expect(extractStreet('123 Main St, Apt 4, City')).toBe('main street');
  });

  it('handles addresses without house numbers', () => {
    expect(extractStreet('Oak Avenue')).toBe('oak avenue');
  });

  it('normalizes abbreviations', () => {
    expect(extractStreet('45 Elm Blvd')).toBe('elm boulevard');
  });
});

// ── Venue helpers ───────────────────────────────────────────────────────────

function makeVenue(overrides: Partial<VenueRecord> = {}): VenueRecord {
  return {
    id: 'ven-1',
    name: 'Test Venue',
    address: '123 Main St',
    city: 'Berlin',
    country: 'Germany',
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

// ── findDuplicateAddressVenues (Rule 4) ─────────────────────────────────────

describe('findDuplicateAddressVenues', () => {
  it('detects two venues at the same normalized address', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Club A', address: '123 Main St.' }),
      makeVenue({ id: 'b', name: 'Club B', address: '123 Main Street' }),
    ];
    const pairs = findDuplicateAddressVenues(venues);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].matchType).toBe('same_address');
  });

  it('does not match venues in different cities', () => {
    const venues = [
      makeVenue({ id: 'a', address: '123 Main St', city: 'Berlin' }),
      makeVenue({ id: 'b', address: '123 Main St', city: 'Munich' }),
    ];
    const pairs = findDuplicateAddressVenues(venues);
    expect(pairs).toHaveLength(0);
  });

  it('detects three venues at same address as 3 pairs', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Club A', address: '10 Elm Blvd' }),
      makeVenue({ id: 'b', name: 'Club B', address: '10 Elm Boulevard' }),
      makeVenue({ id: 'c', name: 'Club C', address: '10 Elm Blvd.' }),
    ];
    const pairs = findDuplicateAddressVenues(venues);
    expect(pairs).toHaveLength(3); // a-b, a-c, b-c
  });

  it('returns empty for unique addresses', () => {
    const venues = [
      makeVenue({ id: 'a', address: '10 Main St' }),
      makeVenue({ id: 'b', address: '20 Oak Ave' }),
    ];
    const pairs = findDuplicateAddressVenues(venues);
    expect(pairs).toHaveLength(0);
  });

  it('includes name similarity score', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Berghain', address: '123 Main St' }),
      makeVenue({ id: 'b', name: 'Berghain', address: '123 Main Street' }),
    ];
    const pairs = findDuplicateAddressVenues(venues);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].nameSimilarity).toBe(1.0);
  });
});

// ── findSimilarNameSameStreetVenues (Rule 5) ────────────────────────────────

describe('findSimilarNameSameStreetVenues', () => {
  it('detects similar names on the same street', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Berghain', address: '10 Main St' }),
      makeVenue({ id: 'b', name: 'Berghein', address: '20 Main St' }),
    ];
    const pairs = findSimilarNameSameStreetVenues(venues, 0.75);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].matchType).toBe('similar_name_same_street');
    expect(pairs[0].nameSimilarity).toBeGreaterThanOrEqual(0.75);
  });

  it('skips pairs with identical normalized address (covered by rule 4)', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Club XY', address: '10 Main St' }),
      makeVenue({ id: 'b', name: 'Club XY', address: '10 Main Street' }), // same after normalization
    ];
    const pairs = findSimilarNameSameStreetVenues(venues, 0.75);
    expect(pairs).toHaveLength(0);
  });

  it('does not match venues on different streets', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Club XY', address: '10 Main St' }),
      makeVenue({ id: 'b', name: 'Club XY', address: '10 Oak Ave' }),
    ];
    const pairs = findSimilarNameSameStreetVenues(venues, 0.75);
    expect(pairs).toHaveLength(0);
  });

  it('does not match dissimilar names', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Berghain', address: '10 Main St' }),
      makeVenue({ id: 'b', name: 'Tresor', address: '20 Main St' }),
    ];
    const pairs = findSimilarNameSameStreetVenues(venues, 0.75);
    expect(pairs).toHaveLength(0);
  });

  it('does not match venues in different cities', () => {
    const venues = [
      makeVenue({ id: 'a', name: 'Club XY', address: '10 Main St', city: 'Berlin' }),
      makeVenue({ id: 'b', name: 'Club XY', address: '20 Main St', city: 'Munich' }),
    ];
    const pairs = findSimilarNameSameStreetVenues(venues, 0.75);
    expect(pairs).toHaveLength(0);
  });
});

// ── findTimePlaceDuplicates — enhanced dedup (Rule 7) ───────────────────────

describe('findTimePlaceDuplicates — enhanced classification', () => {
  const config = { time_tolerance_min: 10, distance_threshold_m: 50 };

  it('classifies identical titles + same type as auto_merge', () => {
    const events = [
      makeEvent({
        id: 'a',
        title: 'Pride March 2026',
        event_type: 'pride',
        start_date: '2026-06-14T12:00:00Z',
        venue_id: 'v1',
      }),
      makeEvent({
        id: 'b',
        title: 'Pride March 2026',
        event_type: 'pride',
        start_date: '2026-06-14T12:05:00Z',
        venue_id: 'v1',
      }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].classification).toBe('auto_merge');
    expect(pairs[0].confidence.score).toBeGreaterThanOrEqual(0.9);
    expect(pairs[0].titleSimilarity).toBe(1.0);
  });

  it('classifies different titles as flag_review', () => {
    const events = [
      makeEvent({
        id: 'a',
        title: 'Pride March',
        event_type: 'pride',
        start_date: '2026-06-14T12:00:00Z',
        venue_id: 'v1',
      }),
      makeEvent({
        id: 'b',
        title: 'Rainbow Festival',
        event_type: 'festival',
        start_date: '2026-06-14T12:05:00Z',
        venue_id: 'v1',
      }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].classification).toBe('flag_review');
  });

  it('includes confidence factors in result', () => {
    const events = [
      makeEvent({
        id: 'a',
        title: 'Club Night',
        event_type: 'party',
        start_date: '2026-06-14T22:00:00Z',
        venue_id: 'v1',
      }),
      makeEvent({
        id: 'b',
        title: 'Club Night',
        event_type: 'party',
        start_date: '2026-06-14T22:00:00Z',
        venue_id: 'v1',
      }),
    ];
    const pairs = findTimePlaceDuplicates(events, config);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence.factors.length).toBeGreaterThan(0);
    expect(pairs[0].confidence.reasoning).toContain('Score');
  });
});
