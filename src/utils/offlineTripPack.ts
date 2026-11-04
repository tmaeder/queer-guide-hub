import type { TripWithDetails } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useReservations';

const CACHE_PREFIX = 'trip-snapshot-';
const SHELL_CACHE = 'trip-offline-shell-v1';
const MAX_AGE = 36 * 60 * 60 * 1000;
const cacheName = (userId: string) => `${CACHE_PREFIX}account-${userId}`;
const snapshotUrl = (tripId: string) => `/_trip-snapshot/${tripId}.json`;

type SnapshotPlace = Pick<
  TripWithDetails['trip_places'][number],
  | 'id'
  | 'day_id'
  | 'country_id'
  | 'start_time'
  | 'end_time'
  | 'duration_minutes'
  | 'sort_order'
  | 'category'
> & { name: string | null; kind: 'hotel' | 'event' | 'place' };

type SnapshotTrip = Pick<
  TripWithDetails,
  'id' | 'title' | 'status' | 'timezone' | 'start_date' | 'end_date'
> & {
  trip_days: Pick<TripWithDetails['trip_days'][number], 'id' | 'date'>[];
  trip_places: SnapshotPlace[];
};

export type TodayReservation = Pick<
  Reservation,
  'key' | 'trip_id' | 'country_id' | 'type' | 'start_at' | 'end_at' | 'title' | 'provider'
> & { confirmation_code?: string | null };

export interface TripSnapshot {
  savedAt: string;
  trip: SnapshotTrip;
  reservations: TodayReservation[];
}

/** Warm shell assets that might have loaded before the worker took control. */
export async function prepareTripOfflineAssets(): Promise<void> {
  if (import.meta.env.DEV) return;
  if (!navigator.serviceWorker?.controller) throw new Error('Offline app shell unavailable');
  const shell = await fetch('/index.html', { cache: 'no-cache' });
  if (!shell.ok || !shell.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Offline app shell unavailable');
  }
  const shellDocument = new DOMParser().parseFromString(await shell.clone().text(), 'text/html');
  const shellAssets = (page: Document) =>
    Array.from(
      page.querySelectorAll(
        'script[src], link[rel="modulepreload"], link[rel="stylesheet"], link[as="font"]',
      ),
      (element) => element.getAttribute('src') ?? element.getAttribute('href') ?? '',
    ).map((resource) => new URL(resource, location.href).href);
  const resources = new Set([
    ...performance.getEntriesByType('resource').map(({ name }) => name),
    ...shellAssets(document),
    ...shellAssets(shellDocument),
  ]);
  const assets = [...resources].filter((resource) => {
    const url = new URL(resource);
    return (
      url.origin === location.origin &&
      (/^\/assets\/.*\.(js|css)$/.test(url.pathname) ||
        /^\/fonts\/.*\.woff2?$/.test(url.pathname) ||
        /^\/locales\/[a-z-]+\.json$/i.test(url.pathname))
    );
  });

  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    assets.map(async (asset) => {
      const response = (await caches.match(asset)) ?? (await fetch(asset));
      if (!response.ok) throw new Error('Offline asset unavailable');
      await cache.put(asset, response);
    }),
  );
  await cache.put('/index.html', shell);
}

export async function cacheTripSnapshot(
  userId: string,
  trip: TripWithDetails,
  reservations: Reservation[],
): Promise<void> {
  const { id, title, status, timezone, start_date, end_date } = trip;
  const snapshot: TripSnapshot = {
    savedAt: new Date().toISOString(),
    trip: {
      id,
      title,
      status,
      timezone,
      start_date,
      end_date,
      trip_days: trip.trip_days.map(({ id, date }) => ({ id, date })),
      trip_places: trip.trip_places.map((place) => ({
        id: place.id,
        day_id: place.day_id,
        country_id: place.country_id,
        start_time: place.start_time,
        end_time: place.end_time,
        duration_minutes: place.duration_minutes,
        sort_order: place.sort_order,
        category: place.category,
        name: place.venues?.name ?? place.events?.title ?? place.hotels?.name ?? place.custom_name,
        kind: place.hotels ? 'hotel' : place.events ? 'event' : 'place',
      })),
    },
    reservations: reservations
      .filter((row) => row.trip_id === id)
      .map(({ key, trip_id, country_id, type, start_at, end_at, title, provider }) => ({
        key,
        trip_id,
        country_id,
        type,
        start_at,
        end_at,
        title,
        provider,
      })),
  };
  const cache = await caches.open(cacheName(userId));
  await cache.put(
    snapshotUrl(id),
    new Response(JSON.stringify(snapshot), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

export async function readTripSnapshot(
  userId: string,
  tripId: string,
): Promise<TripSnapshot | null> {
  try {
    const cache = await caches.open(cacheName(userId));
    const hit = await cache.match(snapshotUrl(tripId));
    if (!hit) return null;
    const snapshot = (await hit.json()) as TripSnapshot;
    const age = Date.now() - Date.parse(snapshot.savedAt);
    if (snapshot.trip.id !== tripId || !Number.isFinite(age) || age > MAX_AGE || age < 0) {
      await cache.delete(snapshotUrl(tripId));
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export async function clearTripSnapshots(userId?: string): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (name) =>
            name === (userId && cacheName(userId)) ||
            (name.startsWith(CACHE_PREFIX) && !name.startsWith(`${CACHE_PREFIX}account-`)),
        )
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Storage may be disabled on this device.
  }
}

export async function removeTripSnapshot(userId: string, tripId: string): Promise<void> {
  try {
    const cache = await caches.open(cacheName(userId));
    await cache.delete(snapshotUrl(tripId));
  } catch {
    // An access denial still blocks the online view.
  }
}
