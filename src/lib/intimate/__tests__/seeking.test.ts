import { describe, it, expect } from 'vitest';
import { hasSeeking, seekingToFilters } from '../seeking';

describe('seekingToFilters', () => {
  it('expands an age range to the bands it covers', () => {
    expect(seekingToFilters({ age_min: '25-29', age_max: '35-39' }).ageBands).toEqual([
      '25-29',
      '30-34',
      '35-39',
    ]);
  });
  it('treats the full range and nothing set as anyone', () => {
    const any = seekingToFilters({ age_min: '18', age_max: '70+' });
    expect(any.ageBands).toEqual([]);
    expect(hasSeeking(seekingToFilters(null))).toBe(false);
  });
  it('passes roles, body types and genitals through', () => {
    const f = seekingToFilters({ roles: ['top'], body_types: ['bear'], genitalia: ['penis'] });
    expect(f).toMatchObject({ roles: ['top'], bodyTypes: ['bear'], genitalia: ['penis'] });
    expect(hasSeeking(f)).toBe(true);
  });
});
