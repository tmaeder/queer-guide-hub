import { describe, it, expect } from 'vitest';
import { HOTEL_VIBES, HOTEL_VIBE_LABEL } from '../hotelVibes';

describe('hotelVibes', () => {
  it('exports non-empty list', () => {
    expect(HOTEL_VIBES.length).toBeGreaterThan(0);
  });
  it('label map matches', () => {
    for (const v of HOTEL_VIBES) expect(HOTEL_VIBE_LABEL[v.slug]).toBe(v.label);
  });
});
