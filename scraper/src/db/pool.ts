import pg from 'pg';
import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('db');

const pool = new pg.Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  log.error({ err }, 'Unexpected pool error');
});

export { pool };

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  log.debug({ duration, rows: result.rowCount, query: text.slice(0, 80) }, 'Query executed');
  return result;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

export async function closePool(): Promise<void> {
  await pool.end();
}
