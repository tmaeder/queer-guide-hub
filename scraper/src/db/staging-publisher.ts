import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { SourceRawEntity } from '../types/schemas.js';
import type { SourceType } from '../types/connector.js';

/**
 * Publish scraper-collected raw entities into Supabase ingestion_staging.
 *
 * The scraper's local Postgres tables are an intermediate workspace. Production
 * data lives in Supabase. Call this publisher at the end of a scraper run to
 * hand items off to the unified pipeline (normalize → validate → dedup →
 * enrich → review → commit).
 *
 * Connection: uses SUPABASE_DB_URL (read-write postgres URI). Falls back to
 * PUBLISH_DB_URL.
 *
 * Idempotency: two unique indexes guard ingestion_staging.
 *   1. (source_type, source_entity_id, payload_hash) — skips re-stages of
 *      byte-identical payloads. Hashes are computed from a stable JSON
 *      serialization (keys sorted recursively) so the same semantic payload
 *      always hashes identically regardless of key order.
 *   2. (coalesce(source_name, source_type), idempotency_key) WHERE
 *      disposition <> 'rejected' — blocks re-publishing the same source row
 *      while a prior staging entry is still pending/committing, even when
 *      the payload has changed. idempotency_key is filled by a BEFORE INSERT
 *      trigger from source_name + source_entity_id.
 * We use unqualified `ON CONFLICT DO NOTHING` so either violation silently
 * counts as a duplicate instead of failing the whole batch.
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.SUPABASE_DB_URL ?? process.env.PUBLISH_DB_URL;
  if (!url) {
    throw new Error('SUPABASE_DB_URL not set — cannot publish to ingestion_staging');
  }
  pool = new Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

export interface PublishOptions {
  /** Source slug (e.g. "outsavvy"). Written to ingestion_staging.source_name. */
  sourceSlug: string;
  /** Access method classification. Written to ingestion_staging.source_type. */
  sourceType: SourceType;
  targetTable?: 'venues' | 'events' | 'personalities';
  pipelineRunId?: string;
}

export interface PublishResult {
  inserted: number;
  duplicates: number;
  failed: number;
}

/**
 * Deterministically serialize a value to JSON. Object keys are sorted
 * recursively so identical payloads always produce identical strings —
 * and identical SHA-256 hashes, preserving the uniqueness constraint
 * on (source_type, source_entity_id, payload_hash).
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export async function publishToStaging(
  entities: SourceRawEntity[],
  opts: PublishOptions,
): Promise<PublishResult> {
  if (entities.length === 0) return { inserted: 0, duplicates: 0, failed: 0 };

  const targetTable = opts.targetTable ?? guessTargetTable(entities[0]);
  const client = await getPool().connect();
  const result: PublishResult = { inserted: 0, duplicates: 0, failed: 0 };

  // Build parallel arrays for a single INSERT ... SELECT FROM unnest(...).
  // One network round-trip for the whole batch instead of N per-row inserts.
  const raws: unknown[] = [];
  const sourceEntityIds: (string | null)[] = [];
  const hashes: string[] = [];
  const entityTypes: string[] = [];
  const keptEntities: SourceRawEntity[] = [];

  for (const e of entities) {
    const raw = e.raw_data;
    if (raw === null || raw === undefined) {
      result.failed++;
      continue;
    }
    raws.push(JSON.stringify(raw));
    sourceEntityIds.push(e.source_id ?? null);
    hashes.push(sha256(stableStringify(raw)));
    entityTypes.push(
      targetTable === 'venues' ? 'venue' : targetTable === 'events' ? 'event' : 'unknown',
    );
    keptEntities.push(e);
  }

  if (keptEntities.length === 0) return result;

  try {
    const res = await client.query(
      `INSERT INTO public.ingestion_staging
         (raw_data, source_type, source_name, source_entity_id, payload_hash,
          target_table, entity_type, pipeline_run_id, disposition, ai_validation_status,
          dedup_status, created_at, updated_at)
       SELECT r.raw::jsonb, $1, $2, r.sid, r.hash, $3, r.etype, $4,
              'pending', 'pending', 'pending', now(), now()
       FROM unnest($5::text[], $6::text[], $7::text[], $8::text[])
            AS r(raw, sid, hash, etype)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        opts.sourceType,
        opts.sourceSlug,
        targetTable,
        opts.pipelineRunId ?? null,
        raws,
        sourceEntityIds,
        hashes,
        entityTypes,
      ],
    );
    result.inserted = res.rowCount ?? 0;
    result.duplicates = keptEntities.length - result.inserted;
  } catch (err) {
    // Whole-batch failure — surface the error; count every row as failed to
    // make the situation visible. Caller may retry in a smaller batch.
    result.failed += keptEntities.length;
     
    console.error('publishToStaging batch error:', (err as Error).message);
    throw err;
  } finally {
    client.release();
  }

  return result;
}

function guessTargetTable(e: SourceRawEntity): 'venues' | 'events' {
  // Stays/places/venues all land in venues. Events are events.
  return e.entity_type === 'event' ? 'events' : 'venues';
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export async function shutdownPublisher(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
