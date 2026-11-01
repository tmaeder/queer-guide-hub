import { memoryDb } from '@/test/memoryDb';
import { setOfflineDb } from '@/features/packs/offline';
import { installPack, migrate } from '@/features/packs/store';
import type { PackPayload } from '@/features/packs/format';
import { searchVenues, toVenueHits } from '../search';

const mockGetSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => setOfflineDb(null));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

async function dbWithZurich() {
  const db = memoryDb();
  await migrate(db);
  const pack: PackPayload = {
    format: 1,
    id: 'zuerich',
    name: 'Zurich',
    country: 'CH',
    generated_at: '2026-11-01T00:00:00Z',
    hotlines: [],
    venues: [
      {
        id: 'v1',
        slug: 'mylord',
        name: 'Mylord',
        category: 'sauna',
        latitude: 47.37,
        longitude: 8.54,
        city: 'Zurich',
        country: 'CH',
        address: 'Zähringerstrasse 33',
        description: null,
        website: null,
        phone: null,
        instagram: null,
        tags: null,
        accessibility_attributes: null,
      },
    ],
  };
  await installPack(db, pack, {
    id: 'zuerich',
    name: 'Zurich',
    country: 'CH',
    generated_at: pack.generated_at,
    bytes: 1,
    sha256: 'a'.repeat(64),
    venues: 1,
  });
  return db;
}

describe('toVenueHits', () => {
  it('keeps only openable venue hits and falls back to title for the name', () => {
    expect(
      toVenueHits([
        { type: 'venue', slug: 'mylord', title: 'Mylord', city: 'Zurich' },
        { type: 'event', slug: 'pride', name: 'Pride' },
        { type: 'venue', slug: null, name: 'No slug' },
        { type: 'venue', slug: 'nameless' },
      ]),
    ).toEqual([{ slug: 'mylord', name: 'Mylord', category: null, city: 'Zurich' }]);
  });
});

describe('searchVenues', () => {
  it('asks the proxy for venues only and sends no token when signed out', async () => {
    fetchMock.mockResolvedValue(ok({ hits: [{ type: 'venue', slug: 'mylord', name: 'Mylord' }] }));
    const res = await searchVenues('sauna');
    expect(res).toEqual({ hits: [{ slug: 'mylord', name: 'Mylord', category: null, city: null }], offline: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://search.queer.guide/search');
    expect(JSON.parse(init.body)).toEqual({ query: 'sauna', hitsPerPage: 30, filters: { type: 'venue' } });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('sends the session JWT so the proxy can decide on safety-gated places', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
    fetchMock.mockResolvedValue(ok({ hits: [] }));
    await searchVenues('sauna');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-123');
  });

  it('an online empty answer is not replaced by pack results', async () => {
    setOfflineDb(dbWithZurich());
    fetchMock.mockResolvedValue(ok({ hits: [] }));
    expect(await searchVenues('mylord')).toEqual({ hits: [], offline: false });
  });

  it('answers from downloaded packs when the network fails, and says so', async () => {
    setOfflineDb(dbWithZurich());
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const res = await searchVenues('myl');
    expect(res.offline).toBe(true);
    expect(res.hits.map((h) => h.slug)).toEqual(['mylord']);
  });

  it('keeps the network error when no pack matches', async () => {
    setOfflineDb(dbWithZurich());
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(searchVenues('berghain')).rejects.toThrow('Network request failed');
  });

  it('treats a 5xx as a failure, not as no results', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(searchVenues('sauna')).rejects.toThrow('search 503');
  });
});
