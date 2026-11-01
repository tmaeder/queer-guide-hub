import type { PackDb } from './store';

/**
 * Where the online code paths find the local pack database. Registered once
 * at startup by db.ts; kept separate so modules like api/venues.ts can fall
 * back offline without importing a native module (and stay testable).
 */
let offlineDb: Promise<PackDb> | null = null;

export function setOfflineDb(db: Promise<PackDb> | null) {
  offlineDb = db;
}

export function getOfflineDb(): Promise<PackDb> | null {
  return offlineDb;
}

/**
 * Run the online read; if it FAILS (network, timeout, 5xx), try the local
 * pack. A successful online answer always wins, including an empty one: a
 * venue the server no longer returns was closed, merged or gated, and must
 * not be resurrected from an old pack.
 */
export async function withOfflineFallback<T>(
  online: () => Promise<T>,
  local: (db: PackDb) => Promise<T | null>,
): Promise<T> {
  try {
    return await online();
  } catch (err) {
    const db = getOfflineDb();
    if (!db) throw err;
    let fallback: T | null = null;
    try {
      fallback = await local(await db);
    } catch {
      throw err;
    }
    if (fallback == null) throw err;
    return fallback;
  }
}
