import { memoryDb } from '@/test/memoryDb';
import { setOfflineDb } from '@/features/packs/offline';
import { installPack, migrate } from '@/features/packs/store';
import type { PackPayload } from '@/features/packs/format';
import { eventStillOn, search as searchVenues, toHits } from '../search';

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
    events: [
      {
        id: 'e1',
        slug: 'mylord-night',
        title: 'Mylord Night',
        start_date: '2099-01-01T20:00:00+00:00',
        end_date: '2099-01-01T23:00:00+00:00',
        timezone: 'Europe/Zurich',
        latitude: 47.37,
        longitude: 8.54,
        city: 'Zurich',
        country: 'CH',
        address: null,
        event_type: 'party',
        venue_name: 'Mylord',
        description: null,
        ticket_url: null,
        website: null,
        is_free: null,
        price_min: null,
        price_max: null,
        currency: null,
        age_restriction: null,
        accessibility_attributes: null,
        tags: [],
        venue: null,
      },
    ],
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

const NOW = Date.UTC(2026, 10, 1, 12); // 2026-11-01 12:00Z
const sec = (iso: string) => Date.parse(iso) / 1000;

describe('toHits', () => {
  it('keeps openable venues and events, falling back to title for the name', () => {
    expect(
      toHits(
        [
          { type: 'venue', slug: 'mylord', title: 'Mylord', city: 'Zurich' },
          { type: 'event', slug: 'zurich-pride', name: 'Zurich Pride', category: 'pride', start_date: sec('2027-06-19T00:00Z') },
          { type: 'venue', slug: null, name: 'No slug' },
          { type: 'venue', slug: 'nameless' },
          { type: 'news', slug: 'story', title: 'A story' },
        ],
        NOW,
      ),
    ).toEqual([
      { kind: 'venue', slug: 'mylord', name: 'Mylord', category: null, city: 'Zurich' },
      { kind: 'event', slug: 'zurich-pride', name: 'Zurich Pride', category: 'pride', city: null },
    ]);
  });

  it('drops events that are already over — the index is mostly archive', () => {
    const hits = toHits(
      [
        { type: 'event', slug: 'pride-2019', name: 'Pride 2019', start_date: sec('2019-06-15T00:00Z') },
        { type: 'event', slug: 'undated', name: 'Undated' },
      ],
      NOW,
    );
    expect(hits).toEqual([]);
  });
});

describe('eventStillOn', () => {
  it('uses the end date when there is one, so a running festival stays', () => {
    expect(eventStillOn({ start_date: sec('2026-10-01T00:00Z'), end_date: sec('2026-11-30T00:00Z') }, NOW)).toBe(true);
    expect(eventStillOn({ start_date: sec('2026-10-01T00:00Z'), end_date: sec('2026-10-31T00:00Z') }, NOW)).toBe(false);
  });

  it('without an end date, an event is on for a day from its start', () => {
    expect(eventStillOn({ start_date: sec('2026-10-31T22:00Z') }, NOW)).toBe(true);
    expect(eventStillOn({ start_date: sec('2026-10-31T11:00Z') }, NOW)).toBe(false);
  });
});

describe('searchVenues', () => {
  it('asks the proxy for places and events and sends no token when signed out', async () => {
    fetchMock.mockResolvedValue(ok({ hits: [{ type: 'venue', slug: 'mylord', name: 'Mylord' }] }));
    const res = await searchVenues('sauna');
    expect(res).toEqual({ hits: [{ kind: 'venue', slug: 'mylord', name: 'Mylord', category: null, city: null }], offline: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://search.queer.guide/search');
    expect(JSON.parse(init.body)).toEqual({ query: 'sauna', hitsPerPage: 30, filters: { types: ['venue', 'event'] } });
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
    expect(res.hits).toEqual([
      { kind: 'venue', slug: 'mylord', name: 'Mylord', category: 'sauna', city: 'Zurich' },
      { kind: 'event', slug: 'mylord-night', name: 'Mylord Night', category: 'party', city: 'Zurich' },
    ]);
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
