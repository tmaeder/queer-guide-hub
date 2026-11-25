import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readTravelMeetContext,
  formatMeetDates,
  travelMeetHref,
  validTravelDates,
  travelConnectionsAllowed,
} from '../travelMeet';
afterEach(() => vi.useRealTimers());
describe('travel meeting context', () => {
  it('keeps cross-year calendar dates unambiguous and handles invalid edited ranges', () => {
    const range = formatMeetDates('2026-12-31', '2027-01-01', 'en');
    expect(range).toContain('2026');
    expect(range).toContain('2027');
    expect(formatMeetDates('2026-12-31', '2026-12-31', 'en')).not.toContain('–');
    expect(formatMeetDates('invalid', '', 'en')).toBe('invalid – ');
  });
  it('keeps connections hidden when a safety report has no country evidence', () => {
    expect(
      travelConnectionsAllowed({
        status: 'ready',
        hasCriminalizedDestination: false,
        hasDeathPenaltyRiskDestination: false,
      }),
    ).toBe(false);
  });
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
  it('normalizes legacy UUID city links and enters the shared Meet experience', () => {
    const city = '30000000-0000-4000-8000-000000000001';
    const context = readTravelMeetContext(new URLSearchParams(`city=${city}&activity=coffee`));
    expect(context.cityId).toBe(city);
    expect(travelMeetHref(context)).toBe(`/meet?cityId=${city}&activity=coffee`);
  });
  it('does not turn malformed external identifiers or unknown activities into API filters', () => {
    const context = readTravelMeetContext(
      new URLSearchParams('cityId=invalid&tripId=invalid&eventId=invalid&activity=invalid'),
    );
    expect(context).toMatchObject({ cityId: '', tripId: '', eventId: '', activity: '' });
    expect(travelMeetHref(context)).toBe('/meet');
  });
});
