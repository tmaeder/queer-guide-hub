import { describe, expect, it } from 'vitest';
import { landmarkGaps, landmarkIsUseful, landmarkHasOverview } from '../landmarkContent';

describe('landmark minimum content', () => {
  it('the Singing Fountain record (name + kind only) is not useful', () => {
    const p = { description: null, latitude: null, longitude: null, address: null };
    expect(landmarkGaps(p)).toEqual(['significance', 'location']);
    expect(landmarkIsUseful(p)).toBe(false);
    expect(landmarkHasOverview(p)).toBe(false);
  });
  it('whitespace does not count as content', () => {
    expect(landmarkIsUseful({ description: '   ', address: ' ' })).toBe(false);
  });
  it('a description alone is useful; location stays a named gap', () => {
    expect(landmarkIsUseful({ description: 'A fountain that plays music.' })).toBe(true);
    expect(landmarkGaps({ description: 'A fountain that plays music.' })).toEqual(['location']);
  });
  it('coordinates alone are useful and give the overview a map', () => {
    const p = { latitude: '39.93', longitude: '-75.16' };
    expect(landmarkIsUseful(p)).toBe(true);
    expect(landmarkHasOverview(p)).toBe(true);
  });
  it('an address alone is useful', () => {
    expect(landmarkIsUseful({ address: 'E Passyunk Ave, Philadelphia' })).toBe(true);
  });
});
