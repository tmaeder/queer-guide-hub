/**
 * IndexedDB-backed queue for trip edits made while offline. Hard-capped
 * scope: UPDATE patches on trip_packing_items (checks) and trip_places
 * (notes, reorder, arrive_mode, times). Inserts/deletes stay online-only —
 * temp-id reconciliation isn't worth the complexity here.
 *
 * Patches coalesce per row (key = account:table:rowId), so toggling a checkbox five
 * times offline replays as one update. Replay is last-write-wins.
 */

export type OfflineTable = 'trip_places' | 'trip_packing_items';

export interface QueuedMutation {
  /** One queue entry per account and row. */
  key: string;
  userId: string;
  version: string;
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
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      } else {
        // Version 1 rows have no account identity and cannot safely replay.
        req.transaction?.objectStore(STORE).clear();
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let value: T;
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error);
      run(transaction.objectStore(STORE), (result) => {
        value = result;
      });
    });
  } finally {
    db.close();
  }
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

export async function enqueueMutation(
  userId: string,
  table: OfflineTable,
  rowId: string,
  tripId: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  const key = `${userId}:${table}:${rowId}`;
  await transact<void>('readwrite', (store) => {
    const request = store.get(key);
    request.onsuccess = () => {
      const existing = request.result as QueuedMutation | undefined;
      const merged: QueuedMutation = {
        key,
        userId,
        table,
        rowId,
        version: crypto.randomUUID(),
        tripId: tripId ?? existing?.tripId ?? null,
        patch: { ...existing?.patch, ...patch },
        queuedAt: new Date().toISOString(),
      };
      store.put(merged);
    };
  });
  notifyChanged();
}

export async function listMutations(userId: string): Promise<QueuedMutation[]> {
  return transact('readonly', (store, result) => {
    const request = store.getAll();
    request.onsuccess = () =>
      result((request.result as QueuedMutation[]).filter((row) => row.userId === userId));
  });
}

export async function removeMutation(mutation: QueuedMutation): Promise<void> {
  await transact<void>('readwrite', (store) => {
    const request = store.get(mutation.key);
    request.onsuccess = () => {
      if (request.result?.version === mutation.version) store.delete(mutation.key);
    };
  });
  notifyChanged();
}

export async function clearOfflineMutations(userId: string): Promise<void> {
  await transact<void>('readwrite', (store) => {
    const request = store.getAll();
    request.onsuccess = () => {
      for (const row of request.result as QueuedMutation[]) {
        if (row.userId === userId) store.delete(row.key);
      }
    };
  });
  notifyChanged();
}

export async function countMutations(userId: string): Promise<number> {
  return (await listMutations(userId)).length;
}
