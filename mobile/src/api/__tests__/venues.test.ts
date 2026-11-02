const mockCalls: Array<[string, ...unknown[]]> = [];

function mockBuilder(): Record<string, (...args: unknown[]) => unknown> {
  const b: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['from', 'select', 'neq', 'is', 'gte', 'lte', 'eq', 'order', 'limit']) {
    b[m] = (...args: unknown[]) => {
      mockCalls.push([m, ...args]);
      return b;
    };
  }
  b.then = (resolve: unknown) =>
    (resolve as (v: unknown) => void)({ data: [], error: null });
  b.maybeSingle = async () => ({ data: null, error: null });
  return b;
}

jest.mock('@/lib/supabase', () => ({ supabase: mockBuilder() }));

import { fetchVenueBySlug, fetchVenuesInBounds, snapBounds } from '../venues';

beforeEach(() => {
  mockCalls.length = 0;
});

describe('venue queries apply the public-listing predicate', () => {
  const predicate = [
    ['neq', 'data_source', 'refuge-restrooms'],
    ['neq', 'review_status', 'archived'],
    ['is', 'duplicate_of_id', null],
    ['is', 'closed_at', null],
  ];

  it('bounds query', async () => {
    await fetchVenuesInBounds([8.4, 47.3, 8.6, 47.4]);
    expect(mockCalls).toEqual(expect.arrayContaining(predicate));
    expect(mockCalls).toEqual(
      expect.arrayContaining([
        ['gte', 'latitude', 47.3],
        ['lte', 'latitude', 47.4],
        ['gte', 'longitude', 8.4],
        ['lte', 'longitude', 8.6],
      ]),
    );
  });

  it('detail query', async () => {
    await fetchVenueBySlug('heaven-zurich');
    expect(mockCalls).toEqual(expect.arrayContaining([...predicate, ['eq', 'slug', 'heaven-zurich']]));
  });
});

describe('snapBounds', () => {
  it('only ever grows the box, so no visible venue is cut off', () => {
    const [w, s, e, n] = snapBounds([8.5412, 47.3712, 8.5488, 47.3799]);
    expect(w).toBeLessThanOrEqual(8.5412);
    expect(s).toBeLessThanOrEqual(47.3712);
    expect(e).toBeGreaterThanOrEqual(8.5488);
    expect(n).toBeGreaterThanOrEqual(47.3799);
  });

  it('maps nearby pans to the same cache key', () => {
    expect(snapBounds([8.5412, 47.3712, 8.5488, 47.3799])).toEqual(
      snapBounds([8.5415, 47.3714, 8.5491, 47.3796]),
    );
  });
});
