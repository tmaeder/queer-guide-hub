import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { combineNearby } from '../useNearbyVenues';

const v = (id: string, category = 'bar') => ({ id, category });

describe('combineNearby', () => {
  it('puts same-category venues first and tops up with the rest', () => {
    const r = combineNearby([v('a', 'community'), v('b', 'community')], [v('c'), v('d')]);
    expect(r.venues.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.sameCategory).toBe(false);
  });

  it('reports sameCategory only when every shown venue matches', () => {
    const r = combineNearby([v('a'), v('b'), v('c')], [], 3);
    expect(r.sameCategory).toBe(true);
  });

  it('caps at the limit and drops duplicates', () => {
    const r = combineNearby([v('a')], [v('a'), v('b'), v('c')], 2);
    expect(r.venues.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('is empty, not "similar", with no venues', () => {
    expect(combineNearby([], [])).toEqual({ venues: [], sameCategory: false });
  });
});
