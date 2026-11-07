import type { SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME, openEncryptedDb, type OpenDeps } from '../db';

const KEY = 'ab'.repeat(32);

function fakeDeps(opts: { storedKey?: string | null; failFirstRead?: boolean } = {}) {
  const log: string[] = [];
  let reads = 0;
  let key = opts.storedKey ?? null;
  const db = {
    execAsync: async (sql: string) => void log.push(`exec ${sql}`),
    getAllAsync: async (sql: string) => {
      log.push(`read ${sql}`);
      if (opts.failFirstRead && reads++ === 0) throw new Error('file is not a database');
      return [];
    },
    closeAsync: async () => void log.push('close'),
  } as unknown as SQLiteDatabase;
  const deps: OpenDeps = {
    open: async (name) => (log.push(`open ${name}`), db),
    remove: async (name) => void log.push(`remove ${name}`),
    getKey: async () => key,
    setKey: async (hex) => void (log.push('setKey'), (key = hex)),
    randomHex: () => KEY,
  };
  return { deps, log, key: () => key };
}

describe('openEncryptedDb', () => {
  it('issues PRAGMA key as the first statement', async () => {
    const { deps, log } = fakeDeps({ storedKey: KEY });
    await openEncryptedDb(deps);
    expect(log[0]).toBe(`open ${DB_NAME}`);
    expect(log[1]).toBe(`exec PRAGMA key = "x'${KEY}'";`);
  });

  it('generates and stores a 32-byte key on first open', async () => {
    const { deps, log, key } = fakeDeps();
    await openEncryptedDb(deps);
    expect(key()).toBe(KEY);
    expect(log.indexOf('setKey')).toBeLessThan(log.indexOf(`open ${DB_NAME}`));
  });

  it('replaces a file the key cannot read (old plaintext packs.db)', async () => {
    const { deps, log } = fakeDeps({ storedKey: KEY, failFirstRead: true });
    await openEncryptedDb(deps);
    expect(log.slice(2)).toEqual([
      'read SELECT count(*) FROM sqlite_master',
      'close',
      `remove ${DB_NAME}`,
      `open ${DB_NAME}`,
      `exec PRAGMA key = "x'${KEY}'";`,
      'read SELECT count(*) FROM sqlite_master',
    ]);
  });
});
