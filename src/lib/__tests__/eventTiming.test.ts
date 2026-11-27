import { describe, expect, it } from 'vitest';
import { eventTiming, isLongRunning, effectiveEnd, endOfLocalDay } from '../eventTiming';

const NOW = Date.parse('2026-11-27T12:00:00Z');

describe('eventTiming', () => {
  it('future start is upcoming', () => {
    expect(eventTiming({ start_date: '2026-12-01T20:00:00Z' }, NOW)).toBe('upcoming');
  });

  it('started, not ended is ongoing (multi-day festival on day 2)', () => {
    expect(
      eventTiming({ start_date: '2026-11-26T10:00:00Z', end_date: '2026-11-29T22:00:00Z' }, NOW),
    ).toBe('ongoing');
  });

  it('past end is ended', () => {
    expect(
      eventTiming({ start_date: '2026-11-20T10:00:00Z', end_date: '2026-11-21T02:00:00Z' }, NOW),
    ).toBe('ended');
  });

  it('cancelled wins over every date', () => {
    expect(eventTiming({ start_date: '2027-01-01T00:00:00Z', status: 'cancelled' }, NOW)).toBe(
      'cancelled',
    );
    expect(
      eventTiming({ start_date: '2027-01-01T00:00:00Z', liveness_status: 'Cancelled' }, NOW),
    ).toBe('cancelled');
  });

  it('start-only event stays on for the rest of its local day', () => {
    // Started 09:00 UTC today, no end: still today in Berlin at 12:00 UTC.
    expect(
      eventTiming({ start_date: '2026-11-27T09:00:00Z', timezone: 'Europe/Berlin' }, NOW),
    ).toBe('ongoing');
    // Started yesterday, no end: ended.
    expect(
      eventTiming({ start_date: '2026-11-26T09:00:00Z', timezone: 'Europe/Berlin' }, NOW),
    ).toBe('ended');
  });

  it('timezone boundary: still "today" in the event zone after UTC midnight has passed', () => {
    // 2026-11-27 23:00 in Los Angeles is 2026-11-28 07:00 UTC.
    const laLate = Date.parse('2026-11-28T07:00:00Z');
    const event = { start_date: '2026-11-27T18:00:00Z', timezone: 'America/Los_Angeles' };
    expect(eventTiming(event, laLate)).toBe('ongoing');
    // Same instant judged in UTC: the UTC day of the start (Nov 27) is over.
    expect(eventTiming({ start_date: event.start_date }, laLate)).toBe('ended');
  });

  it('end_date today in its own zone is still ongoing until that instant', () => {
    expect(
      eventTiming(
        {
          start_date: '2026-11-25T18:00:00Z',
          end_date: '2026-11-27T22:59:00Z',
          timezone: 'Europe/Berlin',
        },
        NOW,
      ),
    ).toBe('ongoing');
  });

  it('bad timezone falls back to UTC, never throws', () => {
    expect(() =>
      effectiveEnd({ start_date: '2026-11-27T09:00:00Z', timezone: 'Mars/Base' }),
    ).not.toThrow();
  });

  it('endOfLocalDay lands at 23:59:59.999 local', () => {
    const end = endOfLocalDay(Date.parse('2026-11-27T09:30:00Z'), 'Europe/Berlin');
    expect(new Date(end).toISOString()).toBe('2026-11-27T22:59:59.999Z');
  });
});

describe('isLongRunning', () => {
  it('a 2022-2027 standing schedule is long-running', () => {
    expect(
      isLongRunning({ start_date: '2022-08-29T17:00:00Z', end_date: '2027-06-30T23:00:00Z' }, NOW),
    ).toBe(true);
  });
  it('a festival on its second day is not', () => {
    expect(
      isLongRunning({ start_date: '2026-11-26T10:00:00Z', end_date: '2026-11-29T22:00:00Z' }, NOW),
    ).toBe(false);
  });
  it('an upcoming event is not', () => {
    expect(isLongRunning({ start_date: '2026-12-26T10:00:00Z' }, NOW)).toBe(false);
  });
});
