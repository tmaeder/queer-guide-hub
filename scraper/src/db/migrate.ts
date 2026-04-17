import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, closePool } from './pool.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('migrate');
const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS scraper_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await query<{ name: string }>('SELECT name FROM scraper_migrations ORDER BY id');
  return new Set(result.rows.map((r) => r.name));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      log.debug({ file }, 'Migration already applied');
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    log.info({ file }, 'Applying migration');

    try {
      await query('BEGIN');
      await query(sql);
      await query('INSERT INTO scraper_migrations (name) VALUES ($1)', [file]);
      await query('COMMIT');
      log.info({ file }, 'Migration applied successfully');
    } catch (err) {
      await query('ROLLBACK');
      log.error({ file, err }, 'Migration failed');
      throw err;
    }
  }
}

// Run directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ''))) {
  runMigrations()
    .then(() => {
      log.info('All migrations complete');
      return closePool();
    })
    .catch((err) => {
      log.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
