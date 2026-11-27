import { describe, expect, it } from 'vitest';
import {
  countryName,
  festivalDateSpan,
  festivalLengthDays,
  festivalPlace,
  festivalTiming,
  festivalTypeKey,
} from '../festivals';

const ed = (start: string, end: string | null) => ({ start_date: start, end_date: end });

describe('festival display helpers', () => {
  it('formats one day, one month, two months and a year boundary', () => {
    expect(festivalDateSpan(ed('2027-01-15T12:00:00', null))).toBe('15 Jan');
    expect(festivalDateSpan(ed('2027-01-15T12:00:00', '2027-01-17T12:00:00'))).toBe('15–17 Jan');
    expect(festivalDateSpan(ed('2027-01-28T12:00:00', '2027-02-02T12:00:00'))).toBe(
      '28 Jan – 2 Feb',
    );
    expect(festivalDateSpan(ed('2026-12-28T12:00:00', '2027-01-02T12:00:00'))).toBe(
      '28 Dec 2026 – 2 Jan 2027',
    );
    expect(
      festivalDateSpan(ed('2027-01-15T12:00:00', '2027-01-17T12:00:00'), undefined, true),
    ).toBe('15–17 Jan 2027');
  });

  it('counts days inclusively', () => {
    expect(festivalLengthDays(ed('2027-01-15T12:00:00', null))).toBe(1);
    expect(festivalLengthDays(ed('2027-01-15T12:00:00', '2027-01-17T20:00:00'))).toBe(3);
  });

  it('places an edition relative to today', () => {
    const now = new Date('2027-01-10T12:00:00');
    expect(festivalTiming(ed('2027-01-09T12:00:00', '2027-01-12T12:00:00'), now)).toEqual({
      kind: 'now',
      endsInDays: 2,
    });
    expect(festivalTiming(ed('2027-01-15T12:00:00', null), now)).toEqual({
      kind: 'soon',
      inDays: 5,
    });
    expect(festivalTiming(ed('2027-06-15T12:00:00', null), now)).toEqual({ kind: 'later' });
    expect(festivalTiming(ed('2026-06-15T12:00:00', null), now)).toEqual({ kind: 'past' });
  });

  it('names a country from its code and leaves anything else alone', () => {
    expect(countryName('DE')).toBe('Germany');
    expect(countryName('de', 'de')).toBe('Deutschland');
    expect(countryName('Hong Kong SAR')).toBe('Hong Kong SAR');
    expect(countryName(null)).toBeNull();
    expect(festivalPlace({ city: 'Hamburg', country: 'DE' })).toBe('Hamburg, Germany');
  });

  it('maps unknown types to other', () => {
    expect(festivalTypeKey('pride')).toBe('pride');
    expect(festivalTypeKey('bear')).toBe('bear');
    expect(festivalTypeKey('conference')).toBe('other');
    expect(festivalTypeKey(null)).toBe('other');
  });
});
