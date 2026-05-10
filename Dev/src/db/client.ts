/**
 * PostgreSQL client (postgres.js).
 *
 * Exports a lazily-created `getDb()` factory and a convenience `sql` getter.
 * Tests that do not touch the DB can import source modules without needing
 * DATABASE_URL, because the connection is only created on first call.
 */
import postgres from 'postgres'
import { config } from '../utils/config.js'
import { logger } from '../utils/logger.js'

let _instance: ReturnType<typeof postgres> | null = null

export function getDb(): ReturnType<typeof postgres> {
  if (!_instance) {
    if (!config.databaseUrl) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env and configure it.'
      )
    }
    _instance = postgres(config.databaseUrl, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: (n) => logger.debug({ notice: n }, 'pg notice'),
    })
    logger.debug('PostgreSQL connection pool created')
  }
  return _instance
}

/** Shorthand used throughout query files. Returns a proper Promise. */
export function sql<T extends readonly object[] = postgres.Row[]>(
  template: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getDb()<T>(template, ...(values as any[])) as unknown as Promise<T>
}

export const dbTransaction = <T>(fn: (tx: postgres.TransactionSql) => T | Promise<T>) =>
  getDb().begin(fn)

export async function closeDb(): Promise<void> {
  if (_instance) {
    await _instance.end()
    _instance = null
    logger.debug('PostgreSQL connection pool closed')
  }
}
