/**
 * Offline trip snapshot pack.
 *
 * Today-mode writes a frozen copy of the trip's itinerary + reservations
 * into Cache Storage via the service worker. If the user loses connectivity
 * (airplane mode on the plane, dead signal at the hotel), the page can
 * rehydrate from the cache instead of showing a blank screen.
 *
 * Not for trip planning — snapshots are stale the moment the user or a
 * co-traveler edits anything. The planner page continues to hit Supabase
 * directly and shows fresh data.
 */

import type { TripWithDetails } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useReservations';

const CACHE_PREFIX = 'trip-snapshot-';
const SNAPSHOT_URL = (tripId: string) => `/_trip-snapshot/${tripId}.json`;

export interface TripSnapshot {
  tripId: string;
  savedAt: string;
  trip: TripWithDetails;
  reservations: Reservation[];
}

const cacheName = (tripId: string) => `${CACHE_PREFIX}${tripId}`;

/** Send the SW a fresh snapshot. Silently no-ops if SW is unavailable. */
export async function cacheTripSnapshot(
  tripId: string,
  trip: TripWithDetails,
  reservations: Reservation[],
): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const payload: TripSnapshot = {
    tripId,
    savedAt: new Date().toISOString(),
    trip,
    reservations,
  };
  try {
    // Open cache from the page directly — equivalent to asking the SW to
    // do it but skips the postMessage round-trip. Page and SW share the
    // same Cache Storage origin.
    const cache = await caches.open(cacheName(tripId));
    const body = JSON.stringify(payload);
    await cache.put(
      SNAPSHOT_URL(tripId),
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch {
    // Cache API unavailable (incognito, strict mode) — silently skip.
  }
}

/** Read the last-known snapshot for a trip, or null if none cached. */
export async function readTripSnapshot(
  tripId: string,
): Promise<TripSnapshot | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(cacheName(tripId));
    const hit = await cache.match(SNAPSHOT_URL(tripId));
    if (!hit) return null;
    return (await hit.json()) as TripSnapshot;
  } catch {
    return null;
  }
}

/**
 * Delete all trip snapshots older than the TTL. Called opportunistically
 * by the page on mount so stale blobs don't accumulate — storage is
 * shared with other PWA caches and eviction pressure hurts everything.
 */
export async function pruneStaleSnapshots(ttlMs = 36 * 60 * 60 * 1000): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    const now = Date.now();
    await Promise.all(
      names
        .filter((n) => n.startsWith(CACHE_PREFIX))
        .map(async (n) => {
          const cache = await caches.open(n);
          const keys = await cache.keys();
          for (const req of keys) {
            const res = await cache.match(req);
            if (!res) continue;
            const text = await res.clone().text();
            try {
              const parsed = JSON.parse(text) as TripSnapshot;
              const saved = Date.parse(parsed.savedAt);
              if (!Number.isFinite(saved) || now - saved > ttlMs) {
                await caches.delete(n);
                return;
              }
            } catch {
              await caches.delete(n);
              return;
            }
          }
        }),
    );
  } catch {
    // Ignore — cache maintenance is best-effort.
  }
}
