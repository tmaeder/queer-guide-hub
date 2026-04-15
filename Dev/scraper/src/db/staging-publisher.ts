import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { SourceRawEntity } from '../types/schemas.js';

/**
 * Publish scraper-collected raw entities into Supabase ingestion_staging.
 *
 * The scraper's local Postgres tables (scraper_entity_map etc) are an
 * intermediate workspace. Production data lives in Supabase. Call this
 * publisher at the end of a scraper run to hand items off to the unified
 * pipeline (normalize → validate → dedup → enrich → review → commit).
 *
 * Connection: uses SUPABASE_DB_URL (read-write postgres URI for the
 * Supabase project). Falls back to PUBLISH_DB_URL.
 *
 * Idempotency: the unique index on (source_type, source_entity_id, payload_hash)
 * prevents duplicate stages of identical payloads.
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
  sourceSlug: string;
  targetTable?: 'venues' | 'events' | 'personalities';
  pipelineRunId?: string;
}

export interface PublishResult {
  inserted: number;
  duplicates: number;
  failed: number;
}

export async function publishToStaging(
  entities: SourceRawEntity[],
  opts: PublishOptions,
): Promise<PublishResult> {
  if (entities.length === 0) return { inserted: 0, duplicates: 0, failed: 0 };

  const targetTable = opts.targetTable ?? guessTargetTable(entities[0]);
  const client = await getPool().connect();
  const result: PublishResult = { inserted: 0, duplicates: 0, failed: 0 };

  try {
    for (const e of entities) {
      try {
        const inserted = await insertOne(client, e, opts.sourceSlug, targetTable, opts.pipelineRunId);
        if (inserted) result.inserted++;
        else result.duplicates++;
      } catch (err) {
        result.failed++;
        // eslint-disable-next-line no-console
        console.error('publishToStaging error:', (err as Error).message, e.source_id);
      }
    }
  } finally {
    client.release();
  }

  return result;
}

async function insertOne(
  client: PoolClient,
  entity: SourceRawEntity,
  sourceSlug: string,
  targetTable: string,
  pipelineRunId?: string,
): Promise<boolean> {
  const raw = entity.raw_data ?? entity;
  const sourceEntityId = entity.source_id ?? null;
  const hash = sha256(JSON.stringify(raw));

  const { rowCount } = await client.query(
    `INSERT INTO public.ingestion_staging (
       raw_data, source_type, source_name, source_entity_id, payload_hash,
       target_table, entity_type, pipeline_run_id, disposition, ai_validation_status,
       dedup_status, created_at, updated_at
     ) VALUES ($1::jsonb, $2, $2, $3, $4, $5, $6, $7, 'pending', 'pending', 'pending', now(), now())
     ON CONFLICT (source_type, source_entity_id, payload_hash) DO NOTHING`,
    [
      raw,
      sourceSlug,
      sourceEntityId,
      hash,
      targetTable,
      targetTable === 'venues' ? 'venue' : targetTable === 'events' ? 'event' : 'unknown',
      pipelineRunId ?? null,
    ],
  );

  return (rowCount ?? 0) > 0;
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
