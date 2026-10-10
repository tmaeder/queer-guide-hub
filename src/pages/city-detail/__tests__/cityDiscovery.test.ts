import { describe, it, expect } from 'vitest';
import { matchesDepartureDate, sortDepartures } from '../cityDiscovery';

describe('city departure windows', () => {
  const now = new Date('2026-10-10T10:00:00Z');
  it('includes festivals overlapping today and excludes unrelated dates', () => {
    expect(
      matchesDepartureDate(
        { start_date: '2026-10-09T12:00:00Z', end_date: '2026-10-12T12:00:00Z' },
        'today',
        now,
        'Europe/Berlin',
      ),
    ).toBe(true);
    expect(
      matchesDepartureDate({ start_date: '2026-10-11T12:00:00Z' }, 'today', now, 'Europe/Berlin'),
    ).toBe(false);
  });
  it('uses destination dates when a visitor is in another timezone', () => {
    const midnightInBerlin = new Date('2026-10-09T22:30:00Z');
    expect(
      matchesDepartureDate(
        { start_date: '2026-10-10T12:00:00Z' },
        'today',
        midnightInBerlin,
        'Europe/Berlin',
      ),
    ).toBe(true);
    expect(
      matchesDepartureDate(
        { start_date: '2026-10-10T12:00:00Z' },
        'today',
        midnightInBerlin,
        'America/New_York',
      ),
    ).toBe(false);
  });
  it('includes both weekend days on Saturday and the remaining Sunday on Sunday', () => {
    expect(
      matchesDepartureDate({ start_date: '2026-10-11T12:00:00Z' }, 'weekend', now, 'Europe/Berlin'),
    ).toBe(true);
    expect(
      matchesDepartureDate({ start_date: '2026-10-12T12:00:00Z' }, 'weekend', now, 'Europe/Berlin'),
    ).toBe(false);
    expect(
      matchesDepartureDate(
        { start_date: '2026-10-17T12:00:00Z' },
        'weekend',
        new Date('2026-10-11T10:00:00Z'),
        'Europe/Berlin',
      ),
    ).toBe(false);
  });
  it('bounds next seven days and rejects missing dates for dated filters', () => {
    expect(matchesDepartureDate({ start_date: '2026-10-16T12:00:00Z' }, 'week', now)).toBe(true);
    expect(matchesDepartureDate({ start_date: '2026-10-17T12:00:00Z' }, 'week', now)).toBe(false);
    expect(matchesDepartureDate({ start_date: 'invalid' }, 'today', now)).toBe(false);
  });
  it('excludes expired source records from departures while retaining ongoing events', () => {
    expect(matchesDepartureDate({ start_date: '2022-08-29' }, 'upcoming', now)).toBe(false);
    expect(
      matchesDepartureDate({ start_date: '2026-10-09', end_date: '2026-10-12' }, 'upcoming', now),
    ).toBe(true);
    expect(matchesDepartureDate({ start_date: null }, 'upcoming', now)).toBe(false);
  });

  it('orders ongoing ranges by their displayed end dates alongside future starts', () => {
    const events = [
      { id: 'ongoing', start_date: '2022-01-01', end_date: '2027-01-01' },
      { id: 'next', start_date: '2026-11-01' },
    ];
    expect(sortDepartures(events, now).map((e) => e.id)).toEqual(['next', 'ongoing']);
  });

  it('sorts chronologically without changing the source list and places undated items last', () => {
    const events = [
      { id: 'later', start_date: '2026-12-01' },
      { id: 'unknown', start_date: null },
      { id: 'first', start_date: '2026-10-10' },
    ];
    expect(sortDepartures(events).map((e) => e.id)).toEqual(['first', 'later', 'unknown']);
    expect(events[0].id).toBe('later');
  });
});
