import { describe, expect, it } from 'vitest';
import { eventWindow, previousOccurrence, type ObservanceDateRow } from '@/lib/observanceWindow';

const wad: ObservanceDateRow[] = [
  { country_id: null, country_name: null, starts: '2026-12-01', ends: '2026-12-01' },
];
const history: ObservanceDateRow[] = [
  { country_id: 'ca', country_name: 'Canada', starts: '2027-10-01', ends: '2027-10-31' },
  { country_id: 'gb', country_name: 'United Kingdom', starts: '2027-02-01', ends: '2027-02-28' },
];

describe('eventWindow', () => {
  it('pads a single day by the observance window', () => {
    expect(eventWindow(wad, 3, 3)).toEqual({ from: '2026-11-28', to: '2026-12-04' });
  });
  it('spans every regional rule (links already enforce each country window)', () => {
    expect(eventWindow(history, 0, 0)).toEqual({ from: '2027-02-01', to: '2027-10-31' });
  });
  it('returns null with no rules', () => {
    expect(eventWindow([], 3, 3)).toBeNull();
  });
});

describe('previousOccurrence', () => {
  it('moves a fixed date back one year', () => {
    expect(previousOccurrence(wad)).toEqual([
      { ...wad[0], starts: '2025-12-01', ends: '2025-12-01' },
    ]);
  });
  it('turns 02-29 into 02-28', () => {
    const leap: ObservanceDateRow[] = [
      { country_id: null, country_name: null, starts: '2028-02-29', ends: '2028-02-29' },
    ];
    expect(previousOccurrence(leap)[0]).toMatchObject({ starts: '2027-02-28', ends: '2027-02-28' });
  });
  it('keeps both ends of a month row', () => {
    expect(previousOccurrence(history)[0]).toMatchObject({
      starts: '2026-10-01',
      ends: '2026-10-31',
    });
  });
});
