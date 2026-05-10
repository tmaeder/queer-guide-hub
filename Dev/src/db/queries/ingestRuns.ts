import { getDb } from '../client.js'

export interface IngestRunRow {
  id: string
  source: string
  entity_types: string[]
  status: 'running' | 'completed' | 'failed' | 'partial'
  started_at: Date
  completed_at: Date | null
  pages_fetched: number
  entities_parsed: number
  entities_inserted: number
  entities_updated: number
  entities_deduped: number
  entities_blocked: number
  entities_failed: number
  errors: unknown[]
  metadata: Record<string, unknown>
}

export interface ErrorEntry {
  url: string
  message: string
  status?: number
}

export async function startIngestRun(
  source: string,
  entityTypes: string[]
): Promise<string> {
  const db = getDb()
  const rows = await db<{ id: string }[]>`
    INSERT INTO ingest_runs (source, entity_types)
    VALUES (${source}, ${entityTypes})
    RETURNING id
  `
  return rows[0]!.id
}

export async function completeIngestRun(
  id: string,
  counts: {
    pagesFetched: number
    entitiesParsed: number
    entitiesInserted: number
    entitiesUpdated: number
    entitiesDeduped: number
    entitiesBlocked: number
    entitiesFailed: number
  },
  errors: ErrorEntry[],
  status: 'completed' | 'failed' | 'partial' = 'completed',
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const db = getDb()
  await db`
    UPDATE ingest_runs SET
      status              = ${status},
      completed_at        = NOW(),
      pages_fetched       = ${counts.pagesFetched},
      entities_parsed     = ${counts.entitiesParsed},
      entities_inserted   = ${counts.entitiesInserted},
      entities_updated    = ${counts.entitiesUpdated},
      entities_deduped    = ${counts.entitiesDeduped},
      entities_blocked    = ${counts.entitiesBlocked},
      entities_failed     = ${counts.entitiesFailed},
      errors              = ${JSON.stringify(errors)},
      metadata            = ${JSON.stringify(metadata)}
    WHERE id = ${id}
  `
}

export async function recordFailedRequest(
  ingestRunId: string,
  source: string,
  url: string,
  opts: { httpStatus?: number; message: string; stack?: string }
): Promise<void> {
  const db = getDb()
  await db`
    INSERT INTO failed_requests (ingest_run_id, source, url, http_status, error_message, error_stack)
    VALUES (${ingestRunId}, ${source}, ${url},
            ${opts.httpStatus ?? null}, ${opts.message}, ${opts.stack ?? null})
  `
}
