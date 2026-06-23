import { describe, it, expect } from 'vitest';
import { matchInterests, readInterests, humanizeInterest } from '../interestMatch';

describe('interestMatch', () => {
  it('matches interests against entity tags, normalising case/spacing', () => {
    expect(matchInterests(['Drag Brunch', 'leather'], ['drag-brunch', 'techno'])).toEqual([
      'drag-brunch',
    ]);
  });

  it('returns [] when there is no overlap', () => {
    expect(matchInterests(['cabaret'], ['hiking', 'climbing'])).toEqual([]);
  });

  it('dedupes and preserves the user label', () => {
    expect(matchInterests(['queer-nightlife', 'Queer Nightlife'], ['Queer Nightlife'])).toEqual([
      'Queer Nightlife',
    ]);
  });

  it('readInterests coerces loose jsonb to clean strings', () => {
    expect(readInterests(['a', '', 2, null, 'b'])).toEqual(['a', 'b']);
    expect(readInterests(null)).toEqual([]);
    expect(readInterests('nope')).toEqual([]);
  });

  it('humanizeInterest titlecases a slug', () => {
    expect(humanizeInterest('drag_brunch-night')).toBe('Drag Brunch Night');
  });
});
