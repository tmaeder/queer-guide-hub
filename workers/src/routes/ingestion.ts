/**
 * Ingestion pipeline and review API — handles data ingestion from multiple
 * sources with validation, deduplication, normalization, and admin review.
 *
 * POST /ingestion/pipeline        — process incoming data
 * GET  /ingestion/review          — list items pending review (admin)
 * POST /ingestion/review/:id      — approve/reject/merge an item (admin)
 * GET  /ingestion/stats           — ingestion statistics (admin)
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { normalizeRecord } from '../lib/text-utils';

const ingestion = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SOURCES = new Set(['api', 'csv', 'scraper', 'manual']);
const VALID_RECORD_TYPES = new Set(['venue', 'event', 'personality', 'news']);

const REQUIRED_FIELDS: Record<string, string[]> = {
  venue: ['name', 'city', 'country'],
  event: ['name', 'start_date'],
  personality: ['name'],
  news: ['title', 'content'],
};

const TABLE_FOR_TYPE: Record<string, string> = {
  venue: 'venues',
  event: 'events',
  personality: 'personalities',
  news: 'news_articles',
};

interface IngestionRecord {
  type: string;
  [key: string]: unknown;
}

interface IngestionOptions {
  skip_dedup?: boolean;
  auto_approve?: boolean;
}

function validateRecord(record: IngestionRecord): string[] {
  const errors: string[] = [];
  const type = record.type;

  if (!VALID_RECORD_TYPES.has(type)) {
    errors.push(`Invalid record type: ${type}`);
    return errors;
  }

  const required = REQUIRED_FIELDS[type];
  for (const field of required) {
    if (!record[field] || (typeof record[field] === 'string' && !(record[field] as string).trim())) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return errors;
}

// ── POST /ingestion/pipeline ─────────────────────────────────────────────────

ingestion.post('/pipeline', requireAuth as any, async (c) => {
  const body = await c.req.json<{
    source: string;
    data: IngestionRecord | IngestionRecord[];
    options?: IngestionOptions;
  }>();

  const { source, data, options } = body;

  if (!source || !VALID_SOURCES.has(source)) {
    return c.json({ error: `Invalid source. Must be one of: ${[...VALID_SOURCES].join(', ')}` }, 400);
  }

  if (!data) {
    return c.json({ error: 'Missing data field' }, 400);
  }

  const records = Array.isArray(data) ? data : [data];
  const results = {
    processed: 0,
    inserted: 0,
    duplicates: 0,
    merge_candidates: 0,
    errors: [] as string[],
  };

  for (const rawRecord of records) {
    results.processed++;

    // Step 1: Validate
    const validationErrors = validateRecord(rawRecord);
    if (validationErrors.length > 0) {
      results.errors.push(`Record ${results.processed}: ${validationErrors.join('; ')}`);
      continue;
    }

    const recordType = rawRecord.type;
    const table = TABLE_FOR_TYPE[recordType];

    // Step 2: Normalize
    const normalized = normalizeRecord(rawRecord);
    // Remove the 'type' field before insertion — it's metadata, not a column
    delete normalized.type;

    // Step 3: Dedup check
    if (!options?.skip_dedup) {
      let isDuplicate = false;
      let isMergeCandidate = false;
      let duplicateOfId: string | null = null;

      if (recordType === 'venue' && normalized.name) {
        // Name similarity + geo proximity for venues
        const existing = await c.env.DB.prepare(
          `SELECT id, name, latitude, longitude FROM venues
           WHERE LOWER(name) = LOWER(?) AND city = ? LIMIT 1`
        ).bind(normalized.name, normalized.city || '').first<{ id: string; name: string; latitude: number; longitude: number }>();

        if (existing) {
          // Check geo proximity if coordinates available
          if (normalized.latitude && normalized.longitude && existing.latitude && existing.longitude) {
            const latDiff = Math.abs(Number(normalized.latitude) - existing.latitude);
            const lonDiff = Math.abs(Number(normalized.longitude) - existing.longitude);
            // Within ~100m is duplicate, within ~1km is merge candidate
            if (latDiff < 0.001 && lonDiff < 0.001) {
              isDuplicate = true;
              duplicateOfId = existing.id;
            } else if (latDiff < 0.01 && lonDiff < 0.01) {
              isMergeCandidate = true;
              duplicateOfId = existing.id;
            }
          } else {
            isDuplicate = true;
            duplicateOfId = existing.id;
          }
        }
      } else {
        // Generic name-based dedup for other types
        const nameField = recordType === 'news' ? 'title' : 'name';
        const nameValue = normalized[nameField];
        if (nameValue) {
          const existing = await c.env.DB.prepare(
            `SELECT id FROM ${table} WHERE LOWER(${nameField}) = LOWER(?) LIMIT 1`
          ).bind(nameValue).first<{ id: string }>();

          if (existing) {
            isDuplicate = true;
            duplicateOfId = existing.id;
          }
        }
      }

      if (isDuplicate || isMergeCandidate) {
        const status = isMergeCandidate ? 'pending' : 'pending';
        const queueId = crypto.randomUUID();
        await c.env.DB.prepare(
          `INSERT INTO ingestion_review_queue (id, record_type, source, data, status, duplicate_of_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          queueId,
          recordType,
          source,
          JSON.stringify(normalized),
          status,
          duplicateOfId,
          new Date().toISOString(),
        ).run();

        if (isMergeCandidate) {
          results.merge_candidates++;
        } else {
          results.duplicates++;
        }
        continue;
      }
    }

    // Step 4: Insert
    try {
      const id = crypto.randomUUID();
      normalized.id = id;
      normalized.created_at = normalized.created_at || new Date().toISOString();
      normalized.updated_at = new Date().toISOString();

      const cols = Object.keys(normalized);
      const placeholders = cols.map(() => '?').join(', ');
      const values = Object.values(normalized).map((v) =>
        typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
      );

      await c.env.DB.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
      ).bind(...values).run();

      results.inserted++;
    } catch (err) {
      results.errors.push(`Record ${results.processed}: Insert failed — ${(err as Error).message}`);
    }
  }

  // Log ingestion run
  try {
    await c.env.DB.prepare(
      `INSERT INTO ingestion_logs (id, source, record_type, record_count, inserted, duplicates, errors, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      source,
      records[0]?.type || 'mixed',
      results.processed,
      results.inserted,
      results.duplicates + results.merge_candidates,
      results.errors.length,
      new Date().toISOString(),
    ).run();
  } catch {
    // Don't fail the whole request over logging
  }

  return c.json({ data: results, error: null });
});

// ── POST /ingestion/review — action-based dispatch for frontend calls ────────

ingestion.post('/review', requireAuth as any, requireAdmin as any, async (c) => {
  const body = await c.req.json<{
    action: string;
    filters?: Record<string, unknown>;
    staging_id?: string;
    staging_ids?: string[];
    notes?: string;
  }>();
  const { action } = body;
  const user = c.get('user') as AuthUser;
  const now = new Date().toISOString();

  if (action === 'list') {
    const filters = body.filters || {};
    const type = filters.type as string | undefined;
    const status = (filters.status as string) || 'pending';
    const page = (filters.page as number) || 1;
    const limit = Math.min((filters.limit as number) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['status = ?'];
    const values: unknown[] = [status];
    if (type) { conditions.push('record_type = ?'); values.push(type); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countResult, dataResult] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) as total FROM ingestion_review_queue ${where}`).bind(...values).first<{ total: number }>(),
      c.env.DB.prepare(
        `SELECT * FROM ingestion_review_queue ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).bind(...values, limit, offset).all(),
    ]);

    const results = (dataResult.results || []).map((row: Record<string, unknown>) => ({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data,
    }));

    return c.json({ data: results, error: null, count: countResult?.total ?? 0, page, limit });
  }

  if (action === 'stats') {
    const [total, pending, approved, rejected] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM ingestion_review_queue').first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM ingestion_review_queue WHERE status = 'pending'").first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM ingestion_review_queue WHERE status = 'approved'").first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM ingestion_review_queue WHERE status = 'rejected'").first<{ count: number }>(),
    ]);
    return c.json({
      data: {
        total: total?.count ?? 0,
        pending: pending?.count ?? 0,
        approved: approved?.count ?? 0,
        rejected: rejected?.count ?? 0,
      },
      error: null,
    });
  }

  if (action === 'approve' && body.staging_id) {
    await c.env.DB.prepare(
      `UPDATE ingestion_review_queue SET status = 'approved', reviewed_by = ?, reviewed_at = ?, notes = ? WHERE id = ?`
    ).bind(user.id, now, body.notes || null, body.staging_id).run();
    return c.json({ data: { approved: 1 }, error: null });
  }

  if (action === 'reject' && body.staging_id) {
    await c.env.DB.prepare(
      `UPDATE ingestion_review_queue SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, notes = ? WHERE id = ?`
    ).bind(user.id, now, body.notes || null, body.staging_id).run();
    return c.json({ data: { rejected: 1 }, error: null });
  }

  if (action === 'bulk_approve' && body.staging_ids?.length) {
    const placeholders = body.staging_ids.map(() => '?').join(',');
    await c.env.DB.prepare(
      `UPDATE ingestion_review_queue SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id IN (${placeholders})`
    ).bind(user.id, now, ...body.staging_ids).run();
    return c.json({ data: { approved: body.staging_ids.length }, error: null });
  }

  if (action === 'bulk_reject' && body.staging_ids?.length) {
    const placeholders = body.staging_ids.map(() => '?').join(',');
    await c.env.DB.prepare(
      `UPDATE ingestion_review_queue SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id IN (${placeholders})`
    ).bind(user.id, now, ...body.staging_ids).run();
    return c.json({ data: { rejected: body.staging_ids.length }, error: null });
  }

  return c.json({ error: `Unknown action: ${action}` }, 400);
});

// ── GET /ingestion/review ────────────────────────────────────────────────────

ingestion.get('/review', requireAuth as any, requireAdmin as any, async (c) => {
  const params = new URL(c.req.url).searchParams;
  const type = params.get('type');
  const status = params.get('status') || 'pending';
  const page = parseInt(params.get('page') || '1', 10);
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);
  const offset = (page - 1) * limit;

  const conditions: string[] = ['status = ?'];
  const values: unknown[] = [status];

  if (type) {
    conditions.push('record_type = ?');
    values.push(type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM ingestion_review_queue ${where}`
  ).bind(...values).first<{ total: number }>();

  const items = await c.env.DB.prepare(
    `SELECT id, record_type, source, data, status, duplicate_of_id, created_at, reviewed_at, reviewed_by
     FROM ingestion_review_queue ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...values, limit, offset).all();

  // Parse JSON data field
  const results = (items.results || []).map((row: Record<string, unknown>) => ({
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data,
  }));

  return c.json({
    data: results,
    error: null,
    count: countResult?.total ?? 0,
    page,
    limit,
  });
});

// ── POST /ingestion/review/:id ───────────────────────────────────────────────

ingestion.post('/review/:id', requireAuth as any, requireAdmin as any, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as AuthUser;
  const body = await c.req.json<{
    action: 'approve' | 'reject' | 'merge';
    merge_into_id?: string;
  }>();

  const { action, merge_into_id } = body;

  if (!['approve', 'reject', 'merge'].includes(action)) {
    return c.json({ error: 'Invalid action. Must be approve, reject, or merge' }, 400);
  }

  // Fetch the review item
  const item = await c.env.DB.prepare(
    `SELECT id, record_type, source, data, status, duplicate_of_id
     FROM ingestion_review_queue WHERE id = ?`
  ).bind(id).first<{
    id: string;
    record_type: string;
    source: string;
    data: string;
    status: string;
    duplicate_of_id: string | null;
  }>();

  if (!item) {
    return c.json({ error: 'Review item not found' }, 404);
  }

  if (item.status !== 'pending') {
    return c.json({ error: `Item already ${item.status}` }, 400);
  }

  const recordData = JSON.parse(item.data) as Record<string, unknown>;
  const table = TABLE_FOR_TYPE[item.record_type];
  const now = new Date().toISOString();

  if (action === 'approve') {
    // Insert the record into the target table
    const recordId = crypto.randomUUID();
    recordData.id = recordId;
    recordData.created_at = recordData.created_at || now;
    recordData.updated_at = now;

    const cols = Object.keys(recordData);
    const placeholders = cols.map(() => '?').join(', ');
    const values = Object.values(recordData).map((v) =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
    );

    await c.env.DB.prepare(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
    ).bind(...values).run();

    await c.env.DB.prepare(
      `UPDATE ingestion_review_queue SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE id = ?`
    ).bind(now, user.id, id).run();

    return c.json({ data: { id, action: 'approved', record_id: recordId }, error: null });
  }

  if (action === 'reject') {
    await c.env.DB.prepare(
      `UPDATE ingestion_review_queue SET status = 'rejected', reviewed_at = ?, reviewed_by = ? WHERE id = ?`
    ).bind(now, user.id, id).run();

    return c.json({ data: { id, action: 'rejected' }, error: null });
  }

  if (action === 'merge') {
    const targetId = merge_into_id || item.duplicate_of_id;
    if (!targetId) {
      return c.json({ error: 'merge_into_id is required for merge action' }, 400);
    }

    // Fetch existing record
    const existing = await c.env.DB.prepare(
      `SELECT * FROM ${table} WHERE id = ?`
    ).bind(targetId).first<Record<string, unknown>>();

    if (!existing) {
      return c.json({ error: 'Target record not found' }, 404);
    }

    // Merge: new data fills in null/empty fields of existing record
    const updates: string[] = [];
    const updateValues: unknown[] = [];

    for (const [key, value] of Object.entries(recordData)) {
      if (key === 'id' || key === 'created_at') continue;
      // Only overwrite if existing field is null or empty
      const existingValue = existing[key];
      if (existingValue === null || existingValue === undefined || existingValue === '') {
        updates.push(`${key} = ?`);
        updateValues.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      updateValues.push(now);

      await c.env.DB.prepare(
        `UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...updateValues, targetId).run();
    }

    await c.env.DB.prepare(
      `UPDATE ingestion_review_queue SET status = 'merged', reviewed_at = ?, reviewed_by = ? WHERE id = ?`
    ).bind(now, user.id, id).run();

    return c.json({ data: { id, action: 'merged', merged_into: targetId }, error: null });
  }
});

// ── GET /ingestion/stats ─────────────────────────────────────────────────────

ingestion.get('/stats', requireAuth as any, requireAdmin as any, async (c) => {
  const bySource = await c.env.DB.prepare(
    `SELECT source, COUNT(*) as count, SUM(inserted) as total_inserted,
            SUM(duplicates) as total_duplicates, SUM(errors) as total_errors
     FROM ingestion_logs GROUP BY source`
  ).all();

  const byType = await c.env.DB.prepare(
    `SELECT record_type, COUNT(*) as count, SUM(record_count) as total_records
     FROM ingestion_logs GROUP BY record_type`
  ).all();

  const byStatus = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as count
     FROM ingestion_review_queue GROUP BY status`
  ).all();

  const recentActivity = await c.env.DB.prepare(
    `SELECT DATE(created_at) as date, COUNT(*) as runs,
            SUM(record_count) as records, SUM(inserted) as inserted
     FROM ingestion_logs
     WHERE created_at >= datetime('now', '-30 days')
     GROUP BY DATE(created_at)
     ORDER BY date DESC`
  ).all();

  const pendingCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM ingestion_review_queue WHERE status = 'pending'`
  ).first<{ count: number }>();

  return c.json({
    data: {
      by_source: bySource.results,
      by_type: byType.results,
      by_status: byStatus.results,
      recent_activity: recentActivity.results,
      pending_review: pendingCount?.count ?? 0,
    },
    error: null,
  });
});

export { ingestion };
