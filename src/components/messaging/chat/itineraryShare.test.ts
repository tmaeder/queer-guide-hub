import { describe, expect, it } from 'vitest';
import { isItineraryMeta } from './itineraryShare';

describe('isItineraryMeta', () => {
  it('accepts a well-formed itinerary meta', () => {
    expect(
      isItineraryMeta({ kind: 'itinerary', item_id: 'abc', status: 'pending' }),
    ).toBe(true);
  });

  it('rejects other card kinds', () => {
    expect(isItineraryMeta({ kind: 'entity_share', title: 'x', path: '/y' })).toBe(false);
    expect(isItineraryMeta({ kind: 'submission', item_id: 'a', status: 'pending' })).toBe(false);
  });

  it('rejects missing item_id or status', () => {
    expect(isItineraryMeta({ kind: 'itinerary', status: 'pending' })).toBe(false);
    expect(isItineraryMeta({ kind: 'itinerary', item_id: 'a' })).toBe(false);
  });

  it('rejects null / non-objects', () => {
    expect(isItineraryMeta(null)).toBe(false);
    expect(isItineraryMeta('itinerary')).toBe(false);
  });
});
