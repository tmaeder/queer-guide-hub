import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { setOfflineDb } from './offline';
import { migrate, type PackDb } from './store';

function adapt(db: SQLiteDatabase): PackDb {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, params);
    },
    all: (sql, params = []) => db.getAllAsync(sql, params),
    // Exclusive: no other statement can interleave with a pack import.
    transaction: (fn) => db.withExclusiveTransactionAsync((txn) => fn(adapt(txn))),
  };
}

let opened: Promise<PackDb> | null = null;

/** The device's pack database, opened and migrated once. */
export function packDb(): Promise<PackDb> {
  if (!opened) {
    opened = openDatabaseAsync('packs.db').then(async (raw) => {
      const db = adapt(raw);
      await migrate(db);
      return db;
    });
    setOfflineDb(opened);
  }
  return opened;
}
