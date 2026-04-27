import { gzipSync } from 'node:zlib';
import { query, getClient } from './pool.js';
import type { EntityType, SourceName, IngestRun } from '../types/index.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('queries');

// ─── Entity table mapping ───────────────────────────────────────
const TABLE_MAP: Record<EntityType, string> = {
  venue: 'scraper_venues',
  event: 'scraper_events',
  place: 'scraper_places',
  stay: 'scraper_stays',
};

// ─── Field-merge semantics ──────────────────────────────────────
/**
 * Columns where incoming values should only overwrite when they provide
 * more complete data. Scalars: only overwrite when incoming is non-null AND
 * (existing is null OR new value is longer for text fields). Arrays: merge
 * (union) to avoid wiping earlier enrichment from other sources.
 */
const ARRAY_MERGE_COLUMNS = new Set(['tags', 'images']);
const IMMUTABLE_COLUMNS = new Set(['id', 'created_at', 'first_seen_at']);
const ALWAYS_OVERWRITE = new Set(['last_seen_at', 'updated_at']);
// Only overwrite if new value is "better" (non-null; longer for text).
const PREFER_LONGER = new Set(['description', 'address', 'opening_hours']);

// ─── Upsert entity ─────────────────────────────────────────────
export interface UpsertEntityParams {
  entityType: EntityType;
  data: Record<string, unknown>;
  sourceUrl: string;
  sourceName: SourceName;
  sourceId: string;
}

/**
 * Atomically upsert a canonical entity and its source→canonical mapping.
 *
 * - Uses INSERT ... ON CONFLICT on scraper_entity_map to avoid races.
 * - On UPDATE, merges array fields (tags/images) and prefers non-null /
 *   longer values for text fields rather than blind overwrite.
 * - Always refreshes last_seen_at so multi-source "seen again" is visible.
 */
export async function upsertEntity(params: UpsertEntityParams): Promise<{ id: string; inserted: boolean }> {
  const { entityType, data, sourceUrl, sourceName, sourceId } = params;
  const table = TABLE_MAP[entityType];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Atomic: claim (or look up) the canonical id via the unique index.
    // On conflict we just bump updated_at and read the existing canonical id.
    const mapRes = await client.query<{ canonical_entity_id: string; created: boolean }>(
      `INSERT INTO scraper_entity_map (source_name, source_id, entity_type, canonical_entity_id)
       VALUES ($1, $2, $3, uuid_generate_v4())
       ON CONFLICT (source_name, source_id, entity_type)
       DO UPDATE SET updated_at = now()
       RETURNING canonical_entity_id,
                 (xmax = 0) AS created`,
      [sourceName, sourceId, entityType],
    );
    const entityId = mapRes.rows[0].canonical_entity_id;
    const mappingCreated = mapRes.rows[0].created;

    // Does the canonical row already exist? (Mapping can exist but row may
    // have been deleted/reset; also another mapping could point to the same
    // canonical id.)
    const existingRow = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE id = $1`,
      [entityId],
    );

    if (existingRow.rows.length === 0) {
      // INSERT
      const cols = ['id', ...Object.keys(data).filter((k) => !IMMUTABLE_COLUMNS.has(k)), 'first_seen_at', 'last_seen_at'];
      const vals: unknown[] = [
        entityId,
        ...Object.entries(data).filter(([k]) => !IMMUTABLE_COLUMNS.has(k)).map(([, v]) => v),
        new Date(),
        new Date(),
      ];
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        vals,
      );
      await client.query('COMMIT');
      return { id: entityId, inserted: true };
    }

    // UPDATE with field-merge semantics.
    const existing = existingRow.rows[0];
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, incoming] of Object.entries(data)) {
      if (IMMUTABLE_COLUMNS.has(key) || ALWAYS_OVERWRITE.has(key)) continue;

      if (ARRAY_MERGE_COLUMNS.has(key)) {
        // Array union (preserve existing, add new) — skip if incoming empty.
        if (Array.isArray(incoming) && incoming.length > 0) {
          setClauses.push(
            `${key} = (SELECT ARRAY(SELECT DISTINCT UNNEST(COALESCE(${key}, '{}') || $${idx}::text[])))`,
          );
          values.push(incoming);
          idx++;
        }
        continue;
      }

      const existingVal = existing[key];
      // Skip null/empty incoming; don't clobber prior enrichment.
      if (incoming === null || incoming === undefined) continue;
      if (typeof incoming === 'string' && incoming.trim() === '') continue;

      if (PREFER_LONGER.has(key)) {
        const existingLen = typeof existingVal === 'string' ? existingVal.length : 0;
        const incomingLen = typeof incoming === 'string' ? incoming.length : 0;
        if (existingVal != null && incomingLen <= existingLen) continue;
      } else {
        // Default: only overwrite when existing is null/empty.
        if (existingVal !== null && existingVal !== undefined && existingVal !== '') continue;
      }

      setClauses.push(`${key} = $${idx}`);
      values.push(incoming);
      idx++;
    }

    // Always refresh last_seen_at to reflect multi-source observation.
    setClauses.push(`last_seen_at = $${idx}`);
    values.push(new Date());
    idx++;

    values.push(entityId);
    if (setClauses.length > 1) {
      await client.query(
        `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${idx}`,
        values,
      );
    }

    await client.query('COMMIT');
    return { id: entityId, inserted: mappingCreated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Register a new source→canonical mapping for an existing entity
 * (used when dedup decides an incoming item is a duplicate of an existing
 * canonical row from another source).
 */
export async function linkSourceToCanonical(
  sourceName: SourceName,
  sourceId: string,
  entityType: EntityType,
  canonicalId: string,
  confidence: number,
): Promise<void> {
  await query(
    `INSERT INTO scraper_entity_map (source_name, source_id, entity_type, canonical_entity_id, confidence)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_name, source_id, entity_type)
     DO UPDATE SET canonical_entity_id = EXCLUDED.canonical_entity_id,
                   confidence = EXCLUDED.confidence,
                   updated_at = now()`,
    [sourceName, sourceId, entityType, canonicalId, confidence],
  );
}

/** Refresh last_seen_at for a canonical entity (called on dedup merge skip). */
export async function touchEntity(entityType: EntityType, canonicalId: string): Promise<void> {
  const table = TABLE_MAP[entityType];
  await query(`UPDATE ${table} SET last_seen_at = now() WHERE id = $1`, [canonicalId]);
}

// ─── Snapshots ──────────────────────────────────────────────────
/**
 * Store a source snapshot. Skips the INSERT if the most-recent snapshot
 * for (source_name, url) already has the same content_hash — avoids churn
 * when a source is scraped repeatedly and returns identical payload.
 */
export async function saveSnapshot(
  sourceName: SourceName,
  url: string,
  contentType: 'html' | 'json' | 'xml',
  contentHash: string,
  content: string,
  retention: number,
): Promise<void> {
  const latest = await query<{ content_hash: string }>(
    `SELECT content_hash FROM scraper_snapshots
     WHERE source_name = $1 AND url = $2
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [sourceName, url],
  );
  if (latest.rows.length > 0 && latest.rows[0].content_hash === contentHash) {
    // Identical payload — just refresh fetched_at of the top row so retention
    // stays predictable without adding a duplicate snapshot.
    await query(
      `UPDATE scraper_snapshots
       SET fetched_at = now()
       WHERE id = (SELECT id FROM scraper_snapshots
                   WHERE source_name = $1 AND url = $2
                   ORDER BY fetched_at DESC LIMIT 1)`,
      [sourceName, url],
    );
    return;
  }

  // Prefer compressed storage — typical HTML payload compresses 5-10×.
  // Leave `content` NULL for new rows; readers fall back to it if content_gz
  // is NULL (migration 004 backfill scenario).
  const compressed = gzipSync(Buffer.from(content, 'utf-8'));
  await query(
    `INSERT INTO scraper_snapshots
       (source_name, url, content_type, content_hash, content_gz, content_encoding)
     VALUES ($1, $2, $3, $4, $5, 'gzip')`,
    [sourceName, url, contentType, contentHash, compressed],
  );

  // Prune old snapshots beyond retention.
  await query(
    `DELETE FROM scraper_snapshots
     WHERE id IN (
       SELECT id FROM scraper_snapshots
       WHERE source_name = $1 AND url = $2
       ORDER BY fetched_at DESC
       OFFSET $3
     )`,
    [sourceName, url, retention],
  );
}

// ─── Ingest Runs ────────────────────────────────────────────────
export async function startIngestRun(
  sourceName: SourceName,
  entityType: EntityType | null,
): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO scraper_ingest_runs (source_name, entity_type, status, started_at)
     VALUES ($1, $2, 'running', now())
     RETURNING id`,
    [sourceName, entityType],
  );
  return res.rows[0].id;
}

export async function updateIngestRun(
  runId: string,
  updates: Partial<IngestRun>,
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id' || key === 'source_name') continue;
    setClauses.push(`${key} = $${idx}`);
    values.push(key === 'errors' ? JSON.stringify(value) : value);
    idx++;
  }

  if (setClauses.length === 0) return;

  values.push(runId);
  await query(
    `UPDATE scraper_ingest_runs SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );
}

export async function finishIngestRun(
  runId: string,
  status: 'completed' | 'failed' | 'partial',
  stats: Partial<IngestRun>,
): Promise<void> {
  await updateIngestRun(runId, {
    ...stats,
    status,
    finished_at: new Date(),
  } as Partial<IngestRun>);
}

// ─── Normalize rejections (observability) ──────────────────────
export async function recordNormalizeRejection(
  sourceName: SourceName,
  sourceId: string,
  entityType: EntityType,
  reason: string,
  sample: unknown,
): Promise<void> {
  try {
    await query(
      `INSERT INTO scraper_normalize_rejections
         (source_name, source_id, entity_type, reject_reason, raw_sample)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [sourceName, sourceId, entityType, reason, JSON.stringify(sample)],
    );
  } catch (err) {
    log.warn({ err }, 'Failed to record normalize rejection');
  }
}

// ─── Dedupe decisions ───────────────────────────────────────────
/**
 * Persist a dedupe decision. Accepts an optional `incomingSourceRef`
 * describing the scraped item that hasn't been persisted yet (e.g. when
 * we choose to skip/merge before writing the canonical row).
 */
export async function saveDedupeDecision(
  entityType: EntityType,
  entityAId: string | null,
  entityBId: string | null,
  matchMethod: string,
  confidence: number,
  decision: 'merge' | 'skip' | 'pending',
  incomingSourceRef?: { sourceName: string; sourceId: string } | null,
): Promise<void> {
  await query(
    `INSERT INTO scraper_dedupe_decisions
       (entity_type, entity_a_id, entity_b_id, match_method, confidence, decision,
        incoming_source_name, incoming_source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entityType,
      entityAId,
      entityBId,
      matchMethod,
      confidence,
      decision,
      incomingSourceRef?.sourceName ?? null,
      incomingSourceRef?.sourceId ?? null,
    ],
  );
}

/**
 * Report orphans in scraper_entity_map — mappings whose canonical row has
 * been deleted. Read-only; safe to expose to the admin UI.
 */
export async function reconcileOrphans(): Promise<Array<{ entity_type: string; orphan_count: number }>> {
  const res = await query<{ entity_type: string; orphan_count: string }>(
    `SELECT entity_type, orphan_count FROM scraper_reconcile_orphans()`,
  );
  return res.rows.map((r) => ({
    entity_type: r.entity_type,
    orphan_count: parseInt(r.orphan_count, 10),
  }));
}

/** Delete orphan mappings for the given entity type. Returns rows removed. */
export async function pruneOrphanMappings(entityType: EntityType): Promise<number> {
  const res = await query<{ scraper_prune_orphan_mappings: number }>(
    `SELECT scraper_prune_orphan_mappings($1) AS scraper_prune_orphan_mappings`,
    [entityType],
  );
  return res.rows[0]?.scraper_prune_orphan_mappings ?? 0;
}

/**
 * Resolve stale 'pending' dedupe decisions. Decisions older than `olderThanDays`
 * with confidence below `confidenceFloor` are auto-demoted to 'skip' so the
 * queue doesn't grow without bound. Returns the number of rows updated.
 *
 * Intended to run from a nightly maintenance job.
 */
export async function resolvePendingDedupeDecisions(
  olderThanDays = 30,
  confidenceFloor = 0.7,
): Promise<number> {
  const res = await query<{ count: string }>(
    `WITH updated AS (
       UPDATE scraper_dedupe_decisions
       SET decision = 'skip'
       WHERE decision = 'pending'
         AND created_at < now() - ($1::int || ' days')::interval
         AND confidence < $2
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM updated`,
    [olderThanDays, confidenceFloor],
  );
  return parseInt(res.rows[0]?.count ?? '0', 10);
}

// ─── Lookup existing entities for dedupe ────────────────────────
/**
 * Fetch existing entities in a given entity type, optionally filtered by
 * one or more cities (case-insensitive). Intended to be called ONCE per
 * batch of candidates and cached in memory for the lifetime of the batch.
 */
export async function getEntitiesForDedupe(
  entityType: EntityType,
  cities?: string[],
): Promise<Array<{ id: string; name: string; city: string | null; country: string | null; address: string | null; website: string | null; lat: number | null; lng: number | null }>> {
  const table = TABLE_MAP[entityType];
  // scraper_places has neither `address` nor `website` columns — select NULL
  // in their place so the caller's row shape stays uniform across types.
  const hasAddress = entityType !== 'place';
  const hasWebsite = entityType !== 'place';
  const addressExpr = hasAddress ? 'address' : 'NULL::text';
  const websiteExpr = hasWebsite ? 'website' : 'NULL::text';
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (cities && cities.length > 0) {
    const normalized = [...new Set(cities.map((c) => c.toLowerCase().trim()).filter(Boolean))];
    if (normalized.length > 0) {
      params.push(normalized);
      conditions.push(`lower(city) = ANY($${params.length}::text[])`);
    }
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query<{
    id: string; name: string; city: string | null; country: string | null;
    address: string | null; website: string | null; lat: number | null; lng: number | null;
  }>(
    `SELECT id, name, city, country, ${addressExpr} AS address, ${websiteExpr} AS website, lat, lng
     FROM ${table}
     ${whereSql}`,
    params,
  );
  return result.rows;
}
