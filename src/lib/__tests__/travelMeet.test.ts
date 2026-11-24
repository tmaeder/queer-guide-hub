import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTravelMeetContext, travelMeetHref, validTravelDates } from '../travelMeet';
afterEach(() => vi.useRealTimers());
describe('travel meeting context', () => {
  it('rejects impossible, stale, reversed and oversized date windows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 12));
    expect(validTravelDates('2026-11-25', '2026-11-25')).toBe(true);
    for (const [start, end] of [
      ['2026-02-30', '2026-03-02'],
      ['2026-11-23', '2026-11-25'],
      ['2026-11-30', '2026-11-29'],
      ['2026-11-25', '2027-01-01'],
      ['invalid', 'invalid'],
    ])
      expect(validTravelDates(start, end)).toBe(false);
  });
  it('does not turn malformed external identifiers or unknown activities into API filters', () => {
    const context = readTravelMeetContext(
      new URLSearchParams('cityId=invalid&tripId=invalid&eventId=invalid&activity=invalid'),
    );
    expect(context).toMatchObject({ cityId: '', tripId: '', eventId: '', activity: '' });
    expect(travelMeetHref(context)).toBe('/meet/travel');
  });
});
