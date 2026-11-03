import type { PackDb, SqlValue } from '@/features/packs/store';

/**
 * PackDb over node:sqlite, so tests run the real schema and SQL (including
 * FTS5) instead of a mock that would agree with whatever the code expects.
 */
export function memoryDb(): PackDb {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const db: PackDb = {
    exec: async (sql) => {
      raw.exec(sql);
    },
    run: async (sql, params: SqlValue[] = []) => {
      raw.prepare(sql).run(...params);
    },
    all: async <T,>(sql: string, params: SqlValue[] = []) =>
      raw.prepare(sql).all(...params) as unknown as T[],
    transaction: async (fn) => {
      raw.exec('BEGIN');
      try {
        await fn(db);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db;
}
