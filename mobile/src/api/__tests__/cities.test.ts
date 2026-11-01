const mockResults: unknown[] = [];
const mockRpc = jest.fn();
function mockBuilder() {
  const b: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ['from', 'select', 'eq']) b[m] = () => b;
  b.maybeSingle = async () => mockResults.shift();
  return b;
}
jest.mock('@/lib/supabase', () => ({
  supabase: Object.assign(mockBuilder(), { rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

import { fetchCityBySlug, fetchGatedCount } from '../cities';

const row = (over: Record<string, unknown>) => ({
  data: { id: 'x', slug: 'x', name: 'X', description: null, duplicate_of_id: null, country: null, ...over },
  error: null,
});

beforeEach(() => {
  mockResults.length = 0;
  mockRpc.mockReset();
});

describe('fetchCityBySlug', () => {
  it('follows a merged-away row to its survivor', async () => {
    mockResults.push(row({ id: 'old', slug: 'zurich-de', duplicate_of_id: 'new' }), row({ id: 'new', slug: 'zuerich', name: 'Zurich' }));
    expect(await fetchCityBySlug('zurich-de')).toEqual({ id: 'new', slug: 'zuerich', name: 'Zurich', description: null, country: null });
  });

  it('gives up on a merge chain that never ends, rather than looping', async () => {
    for (let i = 0; i < 10; i++) mockResults.push(row({ duplicate_of_id: 'loop' }));
    expect(await fetchCityBySlug('a')).toBeNull();
  });

  it('returns null for an unknown slug', async () => {
    mockResults.push({ data: null, error: null });
    expect(await fetchCityBySlug('nowhere')).toBeNull();
  });
});

describe('fetchGatedCount', () => {
  it('adds gated venues and events and passes only the city id', async () => {
    mockRpc.mockResolvedValue({ data: { venues: 21, events: 19, high_risk: true, organizations: 21 }, error: null });
    expect(await fetchGatedCount('c1')).toEqual({ count: 40, highRisk: true });
    expect(mockRpc).toHaveBeenCalledWith('gated_count_for_location', { p_city_id: 'c1' });
  });
});
