/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cacheTripSnapshot,
  readTripSnapshot,
  pruneStaleSnapshots,
} from '../offlineTripPack';

type CacheLike = {
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
};

function makeCache(stored?: unknown): CacheLike {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockImplementation(async () => {
      if (stored === undefined) return undefined;
      const body = JSON.stringify(stored);
      return {
        clone: () => ({ text: async () => body }),
        text: async () => body,
        json: async () => stored,
      };
    }),
    keys: vi.fn().mockResolvedValue(
      stored !== undefined ? [{ url: 'mock' }] : [],
    ),
  };
}

let mockCaches: {
  open: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} & { __cache?: CacheLike };

beforeEach(() => {
  mockCaches = {
    open: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  vi.stubGlobal('caches', mockCaches);
  // Ensure `serviceWorker` is present so cacheTripSnapshot doesn't bail early.
  if (!('serviceWorker' in navigator)) {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cacheTripSnapshot', () => {
  it('writes a snapshot to Cache Storage under trip-snapshot-<id>', async () => {
    const cache = makeCache();
    mockCaches.open.mockResolvedValueOnce(cache);

    await cacheTripSnapshot(
      'trip-1',
      { id: 'trip-1', title: 'Berlin' } as never,
      [{ id: 'r1' }] as never,
    );

    expect(mockCaches.open).toHaveBeenCalledWith('trip-snapshot-trip-1');
    expect(cache.put).toHaveBeenCalledTimes(1);
    const [url, response] = cache.put.mock.calls[0];
    expect(url).toBe('/_trip-snapshot/trip-1.json');
    const body = await (response as Response).text();
    const parsed = JSON.parse(body);
    expect(parsed.tripId).toBe('trip-1');
    expect(parsed.trip.title).toBe('Berlin');
    expect(parsed.reservations).toEqual([{ id: 'r1' }]);
    expect(parsed.savedAt).toBeTruthy();
  });

  it('silently no-ops when caches.open throws', async () => {
    mockCaches.open.mockRejectedValueOnce(new Error('private mode'));
    await expect(
      cacheTripSnapshot('trip-1', {} as never, []),
    ).resolves.toBeUndefined();
  });
});

describe('readTripSnapshot', () => {
  it('returns the stored snapshot when present', async () => {
    const snapshot = {
      tripId: 'trip-1',
      savedAt: '2026-05-01T00:00:00Z',
      trip: { id: 'trip-1' },
      reservations: [],
    };
    mockCaches.open.mockResolvedValueOnce(makeCache(snapshot));

    const r = await readTripSnapshot('trip-1');
    expect(r).toEqual(snapshot);
  });

  it('returns null when nothing is cached', async () => {
    mockCaches.open.mockResolvedValueOnce(makeCache());
    expect(await readTripSnapshot('trip-1')).toBeNull();
  });

  it('returns null on cache error', async () => {
    mockCaches.open.mockRejectedValueOnce(new Error('denied'));
    expect(await readTripSnapshot('trip-1')).toBeNull();
  });
});

describe('pruneStaleSnapshots', () => {
  it('deletes snapshots older than the TTL', async () => {
    const old = {
      tripId: 'old',
      savedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      trip: {},
      reservations: [],
    };
    mockCaches.keys.mockResolvedValueOnce(['trip-snapshot-old', 'other-cache']);
    mockCaches.open.mockResolvedValueOnce(makeCache(old));

    await pruneStaleSnapshots();

    expect(mockCaches.delete).toHaveBeenCalledWith('trip-snapshot-old');
  });

  it('keeps fresh snapshots', async () => {
    const fresh = {
      tripId: 't1',
      savedAt: new Date().toISOString(),
      trip: {},
      reservations: [],
    };
    mockCaches.keys.mockResolvedValueOnce(['trip-snapshot-t1']);
    mockCaches.open.mockResolvedValueOnce(makeCache(fresh));

    await pruneStaleSnapshots();

    expect(mockCaches.delete).not.toHaveBeenCalled();
  });

  it('deletes caches whose payload fails to parse', async () => {
    const cache: CacheLike = {
      put: vi.fn(),
      match: vi.fn().mockResolvedValue({
        clone: () => ({ text: async () => 'not-json' }),
      }),
      keys: vi.fn().mockResolvedValue([{ url: 'mock' }]),
    };
    mockCaches.keys.mockResolvedValueOnce(['trip-snapshot-bad']);
    mockCaches.open.mockResolvedValueOnce(cache);

    await pruneStaleSnapshots();

    expect(mockCaches.delete).toHaveBeenCalledWith('trip-snapshot-bad');
  });

  it('ignores caches that do not start with the prefix', async () => {
    mockCaches.keys.mockResolvedValueOnce(['unrelated-cache']);
    await pruneStaleSnapshots();
    expect(mockCaches.open).not.toHaveBeenCalled();
  });
});
