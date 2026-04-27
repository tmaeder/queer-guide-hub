/**
 * Raw-content snapshot storage.
 *
 * Saves HTML/JSON snapshots to the DB for debugging.
 * Enforces a per-URL retention cap (SNAPSHOT_RETENTION env var).
 */
import crypto from 'crypto'
import { sql } from '../db/client.js'
import { config } from './config.js'
import { logger } from './logger.js'

export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

interface SaveSnapshotParams {
  url: string
  source: string
  content: string
  contentType: 'html' | 'json'
  httpStatus: number
}

/** Persist a snapshot and prune old ones. Returns the checksum. */
export async function saveSnapshot(p: SaveSnapshotParams): Promise<string> {
  const checksum = computeChecksum(p.content)

  try {
    await sql`
      INSERT INTO source_snapshots
        (url, source, content_type, raw_content, checksum, content_size, http_status)
      VALUES
        (${p.url}, ${p.source}, ${p.contentType},
         ${p.content}, ${checksum}, ${p.content.length}, ${p.httpStatus})
    `

    // Enforce retention: delete anything beyond the N most recent per URL
    await sql`
      DELETE FROM source_snapshots
      WHERE url = ${p.url}
        AND id NOT IN (
          SELECT id FROM source_snapshots
          WHERE url = ${p.url}
          ORDER BY fetched_at DESC
          LIMIT ${config.snapshotRetention}
        )
    `
  } catch (err) {
    logger.warn({ url: p.url, err }, 'Failed to save snapshot (non-fatal)')
  }

  return checksum
}

/** Retrieve the most recent snapshot for a URL, or null. */
export async function getLatestSnapshot(url: string): Promise<{
  content: string
  checksum: string
  fetchedAt: Date
} | null> {
  try {
    const rows = await sql<
      { raw_content: string; checksum: string; fetched_at: Date }[]
    >`
      SELECT raw_content, checksum, fetched_at
      FROM source_snapshots
      WHERE url = ${url}
      ORDER BY fetched_at DESC
      LIMIT 1
    `
    if (!rows[0]) return null
    return {
      content: rows[0].raw_content,
      checksum: rows[0].checksum,
      fetchedAt: rows[0].fetched_at,
    }
  } catch (err) {
    logger.warn({ url, err }, 'Failed to load snapshot (non-fatal)')
    return null
  }
}
