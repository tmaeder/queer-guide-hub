import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { setOfflineDb } from './offline';
import { getMeta, migrate, setMeta, type PackDb } from './store';

/**
 * The pack database is encrypted at rest with SQLCipher (app.config.ts sets
 * `useSQLCipher`). Possessing a list of queer venues can be dangerous in some
 * countries, so the file on disk must be unreadable without this device's
 * keychain/keystore.
 *
 * The 32-byte key is generated once and kept in SecureStore with
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY: it never enters a backup and never moves to
 * another device. A file that cannot be opened with the key — a pre-encryption
 * plaintext packs.db, or a file restored onto a device without its key — is
 * deleted and recreated. Packs are re-downloadable; saved places re-sync for
 * signed-in users.
 */
export const DB_NAME = 'packs.db';
export const KEY_NAME = 'qg.packs.dbkey.v1';

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export interface OpenDeps {
  open(name: string): Promise<SQLiteDatabase>;
  remove(name: string): Promise<void>;
  getKey(): Promise<string | null>;
  setKey(hex: string): Promise<void>;
  randomHex(): string;
}

const nativeDeps: OpenDeps = {
  open: (name) => openDatabaseAsync(name),
  remove: (name) => deleteDatabaseAsync(name),
  getKey: () => SecureStore.getItemAsync(KEY_NAME),
  setKey: (hex) =>
    SecureStore.setItemAsync(KEY_NAME, hex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  randomHex: () => toHex(getRandomBytes(32)),
};

async function keyed(deps: OpenDeps, hex: string): Promise<SQLiteDatabase> {
  const db = await deps.open(DB_NAME);
  // Must be the first statement on the connection, or SQLCipher ignores it.
  await db.execAsync(`PRAGMA key = "x'${hex}'";`);
  try {
    // The key is only checked on the first read.
    await db.getAllAsync('SELECT count(*) FROM sqlite_master');
  } catch (err) {
    // An open handle blocks deleting the file.
    await db.closeAsync().catch(() => undefined);
    throw err;
  }
  return db;
}

/** Open packs.db encrypted, replacing any file the key cannot read. */
export async function openEncryptedDb(deps: OpenDeps = nativeDeps): Promise<SQLiteDatabase> {
  let hex = await deps.getKey();
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) {
    hex = deps.randomHex();
    await deps.setKey(hex);
  }
  try {
    return await keyed(deps, hex);
  } catch {
    // Plaintext from before encryption, or a key that did not survive.
    await deps.remove(DB_NAME).catch(() => undefined);
    return keyed(deps, hex);
  }
}

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

/** The device's pack database, opened, decrypted and migrated once. */
export function packDb(): Promise<PackDb> {
  if (!opened) {
    opened = openEncryptedDb().then(async (raw) => {
      const db = adapt(raw);
      await migrate(db);
      return db;
    });
    setOfflineDb(opened);
  }
  return opened;
}

/**
 * Saved places live in the encrypted DB's meta table, not AsyncStorage
 * (plaintext on disk). The first read moves a legacy AsyncStorage copy across
 * and deletes it.
 */
export const encryptedSavedBackend = {
  async getItem(key: string) {
    const db = await packDb();
    const value = await getMeta(db, key);
    if (value !== null) return value;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await setMeta(db, key, legacy);
      await AsyncStorage.removeItem(key);
    }
    return legacy;
  },
  async setItem(key: string, value: string) {
    await setMeta(await packDb(), key, value);
  },
};
