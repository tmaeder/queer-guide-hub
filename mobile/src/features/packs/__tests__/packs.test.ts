import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Hotline } from '@/api/hotlines';
import { memoryDb } from '@/test/memoryDb';
import {
  PACK_FORMAT,
  PackError,
  type PackEvent,
  type PackIndex,
  type PackIndexEntry,
  type PackPayload,
  type PackVenue,
} from '../format';
import { withOfflineFallback, setOfflineDb } from '../offline';
import { createPackService, LAST_INDEX_KEY } from '../service';
import {
  ftsQuery,
  getMeta,
  installPack,
  listInstalled,
  migrate,
  offlineHotlines,
  removePack,
  eventBySlug,
  eventsInBounds,
  searchEvents,
  searchVenues,
  venueBySlug,
  venuesInBounds,
} from '../store';
import { sha256Hex, verifyIndex, verifyPack } from '../verify';
import { mergeRows } from '../rows';

const secret = ed25519.utils.randomSecretKey();
const PUB = bytesToHex(ed25519.getPublicKey(secret));

function venue(over: Partial<PackVenue> = {}): PackVenue {
  return {
    id: 'v1',
    slug: 'barfuesser',
    name: 'Barfüsser',
    category: 'bar',
    latitude: 47.37,
    longitude: 8.54,
    city: 'Zurich',
    country: 'CH',
    address: 'Spitalgasse 14',
    description: 'Old gay bar',
    website: 'https://example.org',
    phone: '+41 44 000 00 00',
    instagram: null,
    tags: ['bar', 'historic'],
    accessibility_attributes: ['step-free-entrance'],
    ...over,
  } as PackVenue;
}

function event(over: Partial<PackEvent> = {}): PackEvent {
  return {
    id: 'e1',
    slug: 'pub-quiz',
    title: 'Pub Quiz',
    start_date: '2026-11-26T18:30:00+00:00',
    end_date: '2026-11-26T21:30:00+00:00',
    timezone: 'Europe/Zurich',
    latitude: 47.37,
    longitude: 8.54,
    city: 'Zurich',
    country: 'CH',
    address: null,
    event_type: 'social',
    venue_name: 'Kweer',
    description: null,
    ticket_url: null,
    website: null,
    is_free: true,
    price_min: null,
    price_max: null,
    currency: null,
    age_restriction: null,
    accessibility_attributes: null,
    tags: null,
    venue: { slug: 'kweer', name: 'Kweer' },
    ...over,
  } as PackEvent;
}

const hotline = (id: string, country = 'CH'): Hotline => ({
  id,
  name: `Line ${id}`,
  country,
  phone: '+41 143',
  topics: [],
  languages: ['de'],
  hours: '24/7',
  description: '',
});

function pack(over: Partial<PackPayload> = {}): PackPayload {
  return {
    format: PACK_FORMAT,
    id: 'zuerich',
    name: 'Zurich',
    country: 'CH',
    generated_at: '2026-11-01T00:00:00.000Z',
    venues: [venue()],
    hotlines: [hotline('h1'), hotline('int', 'INT')],
    ...over,
  };
}

function entryFor(text: string, p: PackPayload): PackIndexEntry {
  return {
    id: p.id,
    name: p.name,
    country: p.country,
    generated_at: p.generated_at,
    bytes: utf8ToBytes(text).length,
    sha256: sha256Hex(text),
    venues: p.venues.length,
  };
}

function signed(index: PackIndex, key = secret) {
  const payload = JSON.stringify(index);
  return JSON.stringify({ payload, sig: bytesToHex(ed25519.sign(utf8ToBytes(payload), key)) });
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as PackError).code;
  }
  return 'no error';
};

describe('verifyIndex', () => {
  const index: PackIndex = { format: 1, generated_at: '2026-11-01T00:00:00.000Z', packs: [] };

  it('accepts an index signed by the build key', () => {
    expect(verifyIndex(signed(index), PUB).generated_at).toBe(index.generated_at);
  });

  it('refuses a payload altered after signing', () => {
    const env = JSON.parse(signed(index));
    env.payload = env.payload.replace('2026', '2027');
    expect(code(() => verifyIndex(JSON.stringify(env), PUB))).toBe('bad_signature');
  });

  it('refuses an index signed by any other key', () => {
    expect(code(() => verifyIndex(signed(index, ed25519.utils.randomSecretKey()), PUB))).toBe('bad_signature');
  });

  it('refuses everything when the build has no key', () => {
    expect(code(() => verifyIndex(signed(index), undefined))).toBe('not_configured');
  });

  it('refuses an index older than one already accepted (rollback)', () => {
    expect(code(() => verifyIndex(signed(index), PUB, '2026-11-02T00:00:00.000Z'))).toBe('rollback');
    expect(code(() => verifyIndex(signed(index), PUB, index.generated_at))).toBe('no error');
  });

  it('refuses an unknown format even when correctly signed', () => {
    expect(code(() => verifyIndex(signed({ ...index, format: 2 }), PUB))).toBe('bad_format');
  });
});

describe('verifyPack', () => {
  it('accepts a pack matching its pinned digest', () => {
    const p = pack();
    const text = JSON.stringify(p);
    expect(verifyPack(text, entryFor(text, p)).id).toBe('zuerich');
  });

  it('refuses a pack whose bytes changed — e.g. a swapped crisis number', () => {
    const p = pack();
    const text = JSON.stringify(p);
    const swapped = text.replace('+41 143', '+41 999');
    expect(code(() => verifyPack(swapped, entryFor(text, p)))).toBe('digest_mismatch');
  });

  it('refuses a correctly hashed pack served under another id', () => {
    const p = pack({ id: 'berlin' });
    const text = JSON.stringify(p);
    expect(code(() => verifyPack(text, { ...entryFor(text, p), id: 'zuerich' }))).toBe('id_mismatch');
  });
});

describe('pack store (real SQLite + FTS5)', () => {
  async function fresh() {
    const db = memoryDb();
    await migrate(db);
    return db;
  }
  const install = async (db: ReturnType<typeof memoryDb>, p = pack()) => {
    const text = JSON.stringify(p);
    await installPack(db, p, entryFor(text, p));
  };

  it('round-trips a venue to the detail shape the screens render', async () => {
    const db = await fresh();
    await install(db);
    const v = await venueBySlug(db, 'barfuesser');
    expect(v).toMatchObject({ name: 'Barfüsser', tags: ['bar', 'historic'], images: null });
    expect(v?.accessibility_attributes).toEqual(['step-free-entrance']);
    expect(await venueBySlug(db, 'missing')).toBeNull();
  });

  it('answers a bounds query and ignores places outside it', async () => {
    const db = await fresh();
    await install(db, pack({ venues: [venue(), venue({ id: 'v2', slug: 'far', latitude: 52.5, longitude: 13.4 })] }));
    const rows = await venuesInBounds(db, [8.5, 47.3, 8.6, 47.4]);
    expect(rows.map((r) => r.slug)).toEqual(['barfuesser']);
  });

  it('searches by prefix, across diacritics as typed, and survives FTS syntax in input', async () => {
    const db = await fresh();
    await install(db);
    expect((await searchVenues(db, 'Barf')).map((r) => r.slug)).toEqual(['barfuesser']);
    expect((await searchVenues(db, 'spitalg')).length).toBe(1);
    // Operators and quotes are data, not FTS syntax.
    await expect(searchVenues(db, 'bar" OR NEAR(x')).resolves.toBeDefined();
    expect(ftsQuery('  ')).toBeNull();
  });

  it('re-installing replaces a pack instead of duplicating it', async () => {
    const db = await fresh();
    await install(db);
    await install(db, pack({ venues: [venue({ name: 'Barfüsser (renamed)' })] }));
    expect((await searchVenues(db, 'Barf')).length).toBe(1);
    expect((await venueBySlug(db, 'barfuesser'))?.name).toBe('Barfüsser (renamed)');
  });

  it('a failed import leaves the previous version intact', async () => {
    const db = await fresh();
    await install(db);
    const broken = pack({ venues: [venue({ name: 'New' }), venue({ id: 'v2', slug: 'x', name: null as never })] });
    await expect(install(db, broken)).rejects.toThrow();
    expect((await venueBySlug(db, 'barfuesser'))?.name).toBe('Barfüsser');
    expect((await listInstalled(db)).length).toBe(1);
  });

  it('removing a pack removes its places, search rows and hotlines', async () => {
    const db = await fresh();
    await install(db);
    await removePack(db, 'zuerich');
    expect(await venueBySlug(db, 'barfuesser')).toBeNull();
    expect(await searchVenues(db, 'Barf')).toEqual([]);
    expect(await offlineHotlines(db)).toEqual([]);
    expect(await listInstalled(db)).toEqual([]);
  });

  const NOW = Date.parse('2026-11-01T12:00:00Z');
  const withEvents = () =>
    pack({
      events: [
        event(),
        event({ id: 'e2', slug: 'last-week', title: 'Pub Quiz Last Week', start_date: '2026-10-20T18:00:00+00:00', end_date: '2026-10-20T21:00:00+00:00' }),
        event({ id: 'e3', slug: 'far-quiz', title: 'Pub Quiz Berlin', latitude: 52.5, longitude: 13.4 }),
      ],
    });

  it('stores events and returns the detail the event screen renders', async () => {
    const db = await fresh();
    await install(db, withEvents());
    expect(await eventBySlug(db, 'pub-quiz')).toMatchObject({ title: 'Pub Quiz', venue: { slug: 'kweer' } });
    expect(await eventBySlug(db, 'missing')).toBeNull();
  });

  it('a pack ages after download: events that ended since are not offered', async () => {
    const db = await fresh();
    await install(db, withEvents());
    expect((await searchEvents(db, 'quiz', NOW)).map((e) => e.slug).sort()).toEqual(['far-quiz', 'pub-quiz']);
    expect((await eventsInBounds(db, [8.5, 47.3, 8.6, 47.4], NOW)).map((e) => e.slug)).toEqual(['pub-quiz']);
    // Once tonight's quiz is over, it is gone too.
    expect(await searchEvents(db, 'quiz', Date.parse('2026-11-27T00:00:00Z'))).toEqual([]);
  });

  it('an event with no end date counts as on for a day from its start', async () => {
    const db = await fresh();
    await install(db, pack({ events: [event({ end_date: null, start_date: '2026-11-01T00:00:00+00:00' })] }));
    expect((await searchEvents(db, 'quiz', NOW)).length).toBe(1);
    expect(await searchEvents(db, 'quiz', Date.parse('2026-11-02T01:00:00Z'))).toEqual([]);
  });

  it('a pack built before events existed still installs, and removal clears events', async () => {
    const db = await fresh();
    await install(db, pack());
    expect(await searchEvents(db, 'quiz', NOW)).toEqual([]);
    await install(db, withEvents());
    await removePack(db, 'zuerich');
    expect(await eventBySlug(db, 'pub-quiz')).toBeNull();
    expect(await searchEvents(db, 'quiz', NOW)).toEqual([]);
  });

  it('dedupes hotlines shared by several packs (international lines)', async () => {
    const db = await fresh();
    await install(db);
    await install(db, pack({ id: 'berlin', name: 'Berlin', country: 'DE', venues: [], hotlines: [hotline('int', 'INT')] }));
    expect((await offlineHotlines(db)).map((h) => h.id).sort()).toEqual(['h1', 'int']);
  });
});

describe('pack service', () => {
  function host(files: Record<string, string>) {
    const calls: string[] = [];
    const get = async (url: string) => {
      calls.push(url);
      const name = url.split('/').pop()!;
      if (!(name in files)) throw new PackError('network', `404 ${name}`);
      return files[name]!;
    };
    return { get, calls };
  }
  const config = { baseUrl: 'https://packs.example/v1/', publicKey: PUB };

  it('downloads, verifies and imports end to end, and records the index time', async () => {
    const db = memoryDb();
    await migrate(db);
    const p = pack();
    const text = JSON.stringify(p);
    const index: PackIndex = { format: 1, generated_at: '2026-11-01T00:00:00.000Z', packs: [entryFor(text, p)] };
    const { get, calls } = host({ 'index.json': signed(index), 'zuerich.json': text });
    const svc = createPackService(db, config, get);

    const fetched = await svc.fetchIndex();
    await svc.install(fetched.packs[0]!);
    expect(calls).toEqual(['https://packs.example/v1/index.json', 'https://packs.example/v1/zuerich.json']);
    expect(await getMeta(db, LAST_INDEX_KEY)).toBe(index.generated_at);
    expect((await listInstalled(db))[0]).toMatchObject({ id: 'zuerich', venue_count: 1 });
  });

  it('writes nothing when the pack fails verification', async () => {
    const db = memoryDb();
    await migrate(db);
    const p = pack();
    const text = JSON.stringify(p);
    const { get } = host({ 'zuerich.json': text.replace('Barfüsser', 'Evil') });
    const svc = createPackService(db, config, get);
    await expect(svc.install(entryFor(text, p))).rejects.toMatchObject({ code: 'digest_mismatch' });
    expect(await listInstalled(db)).toEqual([]);
  });

  it('refuses to run against a non-https host', async () => {
    const db = memoryDb();
    await migrate(db);
    const svc = createPackService(db, { baseUrl: 'http://packs.example', publicKey: PUB }, host({}).get);
    await expect(svc.fetchIndex()).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('withOfflineFallback', () => {
  afterEach(() => setOfflineDb(null));

  it('a successful online answer wins, even an empty one', async () => {
    const local = jest.fn(async () => ['stale']);
    setOfflineDb(Promise.resolve(memoryDb()));
    await expect(withOfflineFallback(async () => [] as string[], local)).resolves.toEqual([]);
    expect(local).not.toHaveBeenCalled();
  });

  it('falls back to the pack when the network read fails', async () => {
    setOfflineDb(Promise.resolve(memoryDb()));
    await expect(
      withOfflineFallback(
        async () => {
          throw new Error('offline');
        },
        async () => 'local',
      ),
    ).resolves.toBe('local');
  });

  it('keeps the original error when no pack has the answer', async () => {
    setOfflineDb(Promise.resolve(memoryDb()));
    await expect(
      withOfflineFallback(
        async () => {
          throw new Error('offline');
        },
        async () => null,
      ),
    ).rejects.toThrow('offline');
  });
});

describe('mergeRows', () => {
  it('keeps installed packs that left the index so they stay removable', () => {
    const rows = mergeRows(
      [{ id: 'berlin', name: 'Berlin', country: 'DE', generated_at: '', bytes: 1, sha256: 'a'.repeat(64), venues: 3 }],
      [{ id: 'old', name: 'Old Town', country: 'CH', generated_at: '', sha256: 'b', bytes: 1, venue_count: 1, installed_at: '' }],
    );
    expect(rows.map((r) => [r.id, !!r.available, !!r.installed])).toEqual([
      ['berlin', true, false],
      ['old', false, true],
    ]);
  });
});
