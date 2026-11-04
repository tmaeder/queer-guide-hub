/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripWithDetails } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useReservations';
import { cacheTripSnapshot, clearTripSnapshots, readTripSnapshot } from '../offlineTripPack';

const trip = {
  id: 'trip-1',
  title: 'Zurich',
  status: 'active',
  trip_days: [],
  trip_places: [],
  description: 'Private notes',
} as unknown as TripWithDetails;

const reservation = {
  key: 'booking-1',
  trip_id: trip.id,
  title: 'Hotel',
  confirmation_code: 'private',
  notes: 'private',
  total_amount: 900,
} as Reservation;

const stores = new Map<string, Map<string, Response>>();
beforeEach(() => {
  stores.clear();
  vi.stubGlobal('caches', {
    open: async (name: string) => {
      const cache = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, cache);
      return {
        put: async (key: string, value: Response) => cache.set(key, value),
        match: async (key: string) => cache.get(key)?.clone(),
        delete: async (key: string) => cache.delete(key),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('offline trip snapshots', () => {
  it('scopes a minimized snapshot to the account and clears it on sign-out', async () => {
    await cacheTripSnapshot('alice', trip, [reservation, { ...reservation, trip_id: 'other' }]);
    expect(await readTripSnapshot('bob', trip.id)).toBeNull();
    const snapshot = await readTripSnapshot('alice', trip.id);
    expect(snapshot?.trip.title).toBe('Zurich');
    expect(snapshot?.trip).not.toHaveProperty('description');
    expect(snapshot?.reservations).toHaveLength(1);
    expect(snapshot?.reservations[0]).not.toHaveProperty('confirmation_code');
    await clearTripSnapshots('alice');
    expect(await readTripSnapshot('alice', trip.id)).toBeNull();
  });

  it('enforces expiry when reading', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T00:00:00Z'));
    await cacheTripSnapshot('alice', trip, []);
    vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
    expect(await readTripSnapshot('alice', trip.id)).toBeNull();
  });

  it('reports write failure to the caller', async () => {
    vi.stubGlobal('caches', {
      open: async () => {
        throw new Error('storage denied');
      },
    });
    await expect(cacheTripSnapshot('alice', trip, [])).rejects.toThrow('storage denied');
  });
});
