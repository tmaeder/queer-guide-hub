/**
 * Simple SQL-file migration runner.
 *
 * Usage:  npm run migrate
 *
 * Reads *.sql files from src/db/migrations/ in lexicographic order,
 * applies any that haven't been recorded in _migrations, and marks them done.
 */
import { readdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDb, closeDb } from './client.js'
import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')

async function migrate(): Promise<void> {
  const db = getDb()

  // Ensure tracking table exists
  await db`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  // Read applied migrations
  const applied = await db<{ name: string }[]>`
    SELECT name FROM _migrations ORDER BY id
  `
  const appliedSet = new Set(applied.map((r) => r.name))

  // Collect migration files
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let ran = 0
  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.debug({ file }, 'Migration already applied, skipping')
      continue
    }

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    logger.info({ file }, 'Applying migration…')

    await db.begin(async (t) => {
      await t.unsafe(sql)
      await t.unsafe(`INSERT INTO _migrations (name) VALUES ($1::text)`, [file])
    })

    logger.info({ file }, 'Migration applied successfully')
    ran++
  }

  if (ran === 0) {
    logger.info('Database schema is up to date.')
  } else {
    logger.info({ count: ran }, 'Migrations complete.')
  }
}

migrate()
  .catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
  .finally(closeDb)
