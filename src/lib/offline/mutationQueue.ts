/**
 * IndexedDB-backed queue for trip edits made while offline. Hard-capped
 * scope: UPDATE patches on trip_packing_items (checks) and trip_places
 * (notes, reorder, arrive_mode, times). Inserts/deletes stay online-only —
 * temp-id reconciliation isn't worth the complexity here.
 *
 * Patches coalesce per row (key = table:rowId), so toggling a checkbox five
 * times offline replays as one update. Replay is last-write-wins.
 */

export type OfflineTable = 'trip_places' | 'trip_packing_items';

export interface QueuedMutation {
  /** `${table}:${rowId}` — one queue entry per row. */
  key: string;
  table: OfflineTable;
  rowId: string;
  tripId: string | null;
  patch: Record<string, unknown>;
  queuedAt: string;
}

const DB_NAME = 'qg-offline-queue';
const STORE = 'mutations';

/** Fired on window whenever the queue size changes (badge refresh). */
export const QUEUE_EVENT = 'qg-offline-queue-changed';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

export async function enqueueMutation(
  table: OfflineTable,
  rowId: string,
  tripId: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  const key = `${table}:${rowId}`;
  const existing = (await tx('readonly', (s) => s.get(key))) as QueuedMutation | undefined;
  const merged: QueuedMutation = {
    key,
    table,
    rowId,
    tripId: tripId ?? existing?.tripId ?? null,
    patch: { ...(existing?.patch ?? {}), ...patch },
    queuedAt: new Date().toISOString(),
  };
  await tx('readwrite', (s) => s.put(merged));
  notifyChanged();
}

export async function listMutations(): Promise<QueuedMutation[]> {
  return ((await tx('readonly', (s) => s.getAll())) as QueuedMutation[]) ?? [];
}

export async function removeMutation(key: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(key));
  notifyChanged();
}

export async function countMutations(): Promise<number> {
  return ((await tx('readonly', (s) => s.count())) as number) ?? 0;
}
