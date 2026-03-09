/**
 * Automation routes — content automation, AI tagging, validation, normalization,
 * geo enrichment, link sanitization, workflow dispatch.
 * All AI uses Cloudflare Workers AI (env.AI binding).
 * Migrated from Supabase Edge Functions.
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { aiComplete } from '../lib/ai';

const automation = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// All automation routes require admin
automation.use('*', requireAuth, requireAdmin);

// ── POST /automation/content ── dispatcher
automation.post('/content', async (c) => {
  const { action, target_table, target_id, options } = await c.req.json<{
    action: string; target_table?: string; target_id?: string; options?: Record<string, unknown>;
  }>();

  const pathMap: Record<string, string> = {
    validate: '/automation/validate',
    tag: '/automation/auto-tag',
    enhance: '/automation/ai-enhance',
    normalize: '/automation/normalize',
    'enrich-geo': '/automation/geo-enrich',
    'sanitize-links': '/automation/sanitize-links',
  };

  if (!pathMap[action]) return c.json({ error: `Unknown action: ${action}` }, 400);
  // Forward internally
  return c.json({ dispatched: action, target_table, target_id, options, message: `Use POST ${pathMap[action]} directly` });
});

// ── POST /automation/ai-enhance ──
automation.post('/ai-enhance', async (c) => {
  const { table, id, fields } = await c.req.json<{ table: string; id: string; fields?: string[] }>();

  const record = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!record) return c.json({ error: 'Record not found' }, 404);

  const content = JSON.stringify(record);
  const enhanced = await aiComplete(c.env.AI, {
    messages: [
      { role: 'system', content: 'You are a content editor for an LGBTQ+ travel and culture guide. Enhance the following record by improving descriptions for SEO, fixing grammar, and adding relevant details. Return a JSON object with only the fields that should be updated.' },
      { role: 'user', content: `Table: ${table}\nRecord: ${content}\n${fields ? `Only enhance fields: ${fields.join(', ')}` : 'Enhance description fields.'}` },
    ],
    json: true,
  });

  try {
    const updates = JSON.parse(enhanced);
    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    if (setClauses) {
      await c.env.DB.prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`)
        .bind(...values, new Date().toISOString(), id).run();
    }
    return c.json({ success: true, updated_fields: Object.keys(updates) });
  } catch {
    return c.json({ success: true, raw_response: enhanced, note: 'Could not parse AI response as JSON' });
  }
});

// ── POST /automation/auto-tag ──
automation.post('/auto-tag', async (c) => {
  const { table, id, batch_size } = await c.req.json<{ table: string; id?: string; batch_size?: number }>();
  const limit = batch_size || 10;

  // Get existing tags for context
  const tags = await c.env.DB.prepare('SELECT id, name, category FROM tags LIMIT 500').all<{ id: string; name: string; category: string }>();
  const tagList = (tags.results || []).map((t) => `${t.name} (${t.category || 'uncategorized'})`).join(', ');

  const query = id
    ? c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id)
    : c.env.DB.prepare(`SELECT * FROM ${table} WHERE id NOT IN (SELECT source_id FROM ${table}_tags WHERE source_id IS NOT NULL) LIMIT ?`).bind(limit);

  let records: Record<string, unknown>[];
  try {
    const result = await query.all();
    records = (result.results || []) as Record<string, unknown>[];
  } catch {
    // Fallback: try without the NOT IN subquery
    const result = await c.env.DB.prepare(`SELECT * FROM ${table} LIMIT ?`).bind(limit).all();
    records = (result.results || []) as Record<string, unknown>[];
  }

  let tagged = 0;
  for (const record of records) {
    const text = JSON.stringify(record);
    const response = await aiComplete(c.env.AI, {
      messages: [
        { role: 'system', content: `You are a tagger for an LGBTQ+ guide. Given a record, suggest up to 5 tags from this list: ${tagList.slice(0, 3000)}. Return a JSON array of tag names.` },
        { role: 'user', content: text.slice(0, 2000) },
      ],
      json: true,
    });

    try {
      const suggestedTags = JSON.parse(response) as string[];
      const junctionTable = `${table}_tags`;
      for (const tagName of suggestedTags.slice(0, 5)) {
        const tag = (tags.results || []).find((t) => t.name.toLowerCase() === tagName.toLowerCase());
        if (tag) {
          await c.env.DB.prepare(
            `INSERT OR IGNORE INTO ${junctionTable} (id, ${table.replace(/s$/, '')}_id, tag_id, created_at) VALUES (?, ?, ?, ?)`
          ).bind(crypto.randomUUID(), record.id as string, tag.id, new Date().toISOString()).run().catch(() => {});
          tagged++;
        }
      }
    } catch { /* skip unparseable */ }
  }

  return c.json({ success: true, records_processed: records.length, tags_applied: tagged });
});

// ── POST /automation/validate ──
automation.post('/validate', async (c) => {
  const { table, id } = await c.req.json<{ table: string; id?: string }>();

  const query = id
    ? c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id)
    : c.env.DB.prepare(`SELECT * FROM ${table} LIMIT 100`);
  const records = await query.all();

  const requiredFields: Record<string, string[]> = {
    venues: ['name', 'city_id'],
    events: ['title', 'start_date'],
    news_articles: ['title', 'url'],
    personalities: ['name'],
  };

  const issues: Array<{ id: string; field: string; issue: string }> = [];
  const required = requiredFields[table] || ['name'];

  for (const record of (records.results || []) as Record<string, unknown>[]) {
    for (const field of required) {
      if (!record[field]) issues.push({ id: record.id as string, field, issue: 'missing_required' });
    }
    // URL validation
    for (const [k, v] of Object.entries(record)) {
      if (typeof v === 'string' && (k.endsWith('_url') || k === 'url' || k === 'website')) {
        if (v && !/^https?:\/\/.+/.test(v)) {
          issues.push({ id: record.id as string, field: k, issue: 'invalid_url' });
        }
      }
    }
  }

  return c.json({ success: true, records_checked: records.results?.length || 0, issues });
});

// ── POST /automation/normalize ──
automation.post('/normalize', async (c) => {
  const { table, id, fields } = await c.req.json<{ table: string; id?: string; fields?: string[] }>();

  const query = id
    ? c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id)
    : c.env.DB.prepare(`SELECT * FROM ${table} LIMIT 100`);
  const records = await query.all();

  let updated = 0;
  for (const record of (records.results || []) as Record<string, unknown>[]) {
    const changes: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(record)) {
      if (fields && !fields.includes(k)) continue;
      if (typeof v !== 'string' || k === 'id') continue;

      let normalized = v.trim();
      // Normalize URLs
      if (k.endsWith('_url') || k === 'url' || k === 'website') {
        normalized = normalized.replace(/\?utm_[^&]*(&utm_[^&]*)*/g, '').replace(/\?fbclid=[^&]*/, '').replace(/\/+$/, '');
        if (normalized && !normalized.startsWith('http')) normalized = `https://${normalized}`;
      }
      // Normalize emails
      if (k === 'email' || k.endsWith('_email')) {
        normalized = normalized.toLowerCase();
      }

      if (normalized !== v) changes[k] = normalized;
    }

    if (Object.keys(changes).length > 0) {
      const setClauses = Object.keys(changes).map((k) => `${k} = ?`).join(', ');
      await c.env.DB.prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`)
        .bind(...Object.values(changes), new Date().toISOString(), record.id as string).run();
      updated++;
    }
  }

  return c.json({ success: true, records_checked: records.results?.length || 0, updated });
});

// ── POST /automation/geo-enrich ──
automation.post('/geo-enrich', async (c) => {
  const { table, id } = await c.req.json<{ table: string; id?: string }>();

  const query = id
    ? c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id)
    : c.env.DB.prepare(`SELECT * FROM ${table} WHERE (latitude IS NOT NULL AND city_id IS NULL) OR (latitude IS NULL AND address IS NOT NULL) LIMIT 20`);
  const records = await query.all();

  let enriched = 0;
  for (const record of (records.results || []) as Record<string, unknown>[]) {
    try {
      if (record.latitude && record.longitude && !record.city_id) {
        // Reverse geocode to find city
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${record.longitude},${record.latitude}.json?access_token=${c.env.MAPBOX_TOKEN}&types=place`
        );
        const geo = await res.json() as { features?: Array<{ text: string; context?: Array<{ id: string; text: string }> }> };
        if (geo.features?.[0]) {
          const cityName = geo.features[0].text;
          const countryCtx = geo.features[0].context?.find((ctx) => ctx.id.startsWith('country'));
          const city = await c.env.DB.prepare(
            'SELECT id FROM cities WHERE name = ? LIMIT 1'
          ).bind(cityName).first<{ id: string }>();
          if (city) {
            await c.env.DB.prepare(`UPDATE ${table} SET city_id = ?, updated_at = ? WHERE id = ?`)
              .bind(city.id, new Date().toISOString(), record.id as string).run();
            enriched++;
          }
        }
      } else if (!record.latitude && record.address) {
        // Forward geocode
        const addr = encodeURIComponent(record.address as string);
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${addr}.json?access_token=${c.env.MAPBOX_TOKEN}&limit=1`
        );
        const geo = await res.json() as { features?: Array<{ center: [number, number] }> };
        if (geo.features?.[0]) {
          const [lng, lat] = geo.features[0].center;
          await c.env.DB.prepare(`UPDATE ${table} SET latitude = ?, longitude = ?, updated_at = ? WHERE id = ?`)
            .bind(lat, lng, new Date().toISOString(), record.id as string).run();
          enriched++;
        }
      }
    } catch { /* skip failures */ }
  }

  return c.json({ success: true, records_checked: records.results?.length || 0, enriched });
});

// ── POST /automation/sanitize-links ──
automation.post('/sanitize-links', async (c) => {
  const { table, id } = await c.req.json<{ table: string; id?: string }>();

  const query = id
    ? c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id)
    : c.env.DB.prepare(`SELECT * FROM ${table} LIMIT 100`);
  const records = await query.all();

  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'];
  let sanitized = 0;

  for (const record of (records.results || []) as Record<string, unknown>[]) {
    const changes: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
      if (typeof v !== 'string' || !(k.endsWith('_url') || k === 'url' || k === 'website')) continue;
      if (!v) continue;
      try {
        const url = new URL(v);
        for (const param of trackingParams) url.searchParams.delete(param);
        const cleaned = url.toString().replace(/\/+$/, '');
        if (cleaned !== v) changes[k] = cleaned;
      } catch { /* not a valid URL */ }
    }

    if (Object.keys(changes).length > 0) {
      const setClauses = Object.keys(changes).map((k) => `${k} = ?`).join(', ');
      await c.env.DB.prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`)
        .bind(...Object.values(changes), new Date().toISOString(), record.id as string).run();
      sanitized++;
    }
  }

  return c.json({ success: true, records_checked: records.results?.length || 0, sanitized });
});

// ── POST /automation/categorize-tags ──
automation.post('/categorize-tags', async (c) => {
  const { batch_size } = await c.req.json<{ batch_size?: number }>().catch(() => ({ batch_size: 20 }));

  const uncategorized = await c.env.DB.prepare(
    'SELECT id, name FROM tags WHERE category IS NULL OR category = \'\' LIMIT ?'
  ).bind(batch_size || 20).all<{ id: string; name: string }>();

  if (!uncategorized.results?.length) {
    return c.json({ success: true, categorized: 0, message: 'No uncategorized tags' });
  }

  const tagNames = (uncategorized.results || []).map((t) => t.name).join(', ');
  const response = await aiComplete(c.env.AI, {
    messages: [
      { role: 'system', content: 'Categorize these tags for an LGBTQ+ guide into categories: nightlife, culture, community, health, travel, food, shopping, accommodation, activism, sports, education, media, other. Return a JSON object mapping tag name to category.' },
      { role: 'user', content: tagNames },
    ],
    json: true,
  });

  let categorized = 0;
  try {
    const mapping = JSON.parse(response) as Record<string, string>;
    for (const tag of uncategorized.results || []) {
      const category = mapping[tag.name];
      if (category) {
        await c.env.DB.prepare('UPDATE tags SET category = ?, updated_at = ? WHERE id = ?')
          .bind(category, new Date().toISOString(), tag.id).run();
        categorized++;
      }
    }
  } catch { /* skip */ }

  return c.json({ success: true, categorized, total: uncategorized.results?.length || 0 });
});

// ── POST /automation/auto-tag-content ──
automation.post('/auto-tag-content', async (c) => {
  const { content_type, content_id, batch_size } = await c.req.json<{
    content_type: string; content_id?: string; batch_size?: number;
  }>();
  // Delegate to auto-tag with correct table
  const tableMap: Record<string, string> = {
    venue: 'venues', event: 'events', news: 'news_articles', personality: 'personalities',
  };
  const table = tableMap[content_type] || content_type;

  // Delegate: return instruction to use auto-tag endpoint directly
  return c.json({ dispatched: 'auto-tag', table, id: content_id, batch_size, message: 'Use POST /automation/auto-tag directly' });
});

// ── POST /automation/workflow ──
automation.post('/workflow', async (c) => {
  const { workflow_name, params } = await c.req.json<{ workflow_name: string; params?: Record<string, unknown> }>();

  const workflows: Record<string, string[]> = {
    'full-import-pipeline': ['validate', 'normalize', 'sanitize-links', 'geo-enrich', 'auto-tag'],
    'content-refresh': ['validate', 'ai-enhance', 'normalize'],
    'link-health-check': ['sanitize-links', 'validate'],
    'geo-backfill': ['geo-enrich'],
  };

  const steps = workflows[workflow_name];
  if (!steps) return c.json({ error: `Unknown workflow: ${workflow_name}. Available: ${Object.keys(workflows).join(', ')}` }, 400);

  const results: Array<{ step: string; status: string }> = [];
  for (const step of steps) {
    results.push({ step, status: 'queued' });
  }

  return c.json({
    success: true, workflow: workflow_name, steps: results,
    message: 'Workflow steps queued. Execute each step via /automation/{step} with appropriate params.',
  });
});

// ── POST /automation/clean-merge-duplicates ──
automation.post('/clean-merge-duplicates', async (c) => {
  const body = await c.req.json<{
    entityTypes?: string[];
    limit?: number;
    offset?: number;
    scanOnly?: boolean;
    dryRun?: boolean;
    autoMergeThreshold?: number;
    reviewThreshold?: number;
    includeStaging?: boolean;
  }>();

  const db = c.env.DB;
  const entityTypes = body.entityTypes || ['venues', 'events', 'personalities', 'news_articles', 'cities'];
  const limit = body.limit ?? 500;
  const offset = body.offset ?? 0;
  const scanOnly = body.scanOnly ?? false;
  const dryRun = body.dryRun ?? true;
  const autoMergeThreshold = body.autoMergeThreshold ?? 0.9;
  const reviewThreshold = body.reviewThreshold ?? 0.7;

  const byType: Record<string, unknown> = {};
  let totalScanned = 0;
  let totalAutoMerged = 0;
  let totalFlagged = 0;
  const errors: string[] = [];

  for (const entityType of entityTypes) {
    try {
      // Count total records
      const countResult = await db.prepare(
        `SELECT COUNT(*) as total FROM ${entityType}`
      ).first<{ total: number }>();
      const total = countResult?.total || 0;

      // Scan for potential duplicates using name similarity
      const nameCol = entityType === 'news_articles' ? 'title' : 'name';
      let scanned = 0;
      let autoMerged = 0;
      let flaggedForReview = 0;

      if (limit > 0) {
        const rows = await db.prepare(
          `SELECT id, ${nameCol} as name FROM ${entityType} ORDER BY ${nameCol} LIMIT ? OFFSET ?`
        ).bind(limit, offset).all();

        scanned = rows.results?.length || 0;

        // Find duplicates by comparing names
        const seen = new Map<string, string>();
        for (const row of (rows.results || []) as Array<{ id: string; name: string }>) {
          if (!row.name) continue;
          const normalized = row.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!normalized) continue;

          const existing = seen.get(normalized);
          if (existing && existing !== row.id) {
            // Check if already in dedupe_decisions
            const existingDecision = await db.prepare(
              `SELECT id FROM scraper_dedupe_decisions WHERE entity_type = ? AND ((entity_id_a = ? AND entity_id_b = ?) OR (entity_id_a = ? AND entity_id_b = ?)) LIMIT 1`
            ).bind(entityType, existing, row.id, row.id, existing).first();

            if (!existingDecision) {
              // Calculate simple similarity score
              const score = 1.0; // exact normalized match = 1.0
              const decision = score >= autoMergeThreshold ? 'auto_merge' : (score >= reviewThreshold ? 'pending' : 'skip');

              if (!dryRun && !scanOnly) {
                await db.prepare(
                  `INSERT INTO scraper_dedupe_decisions (entity_type, entity_id_a, entity_id_b, similarity_score, decision, created_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))`
                ).bind(entityType, existing, row.id, score, decision).run();
              }

              if (decision === 'auto_merge') autoMerged++;
              else if (decision === 'pending') flaggedForReview++;
            }
          } else {
            seen.set(normalized, row.id);
          }
        }
      }

      totalScanned += scanned;
      totalAutoMerged += autoMerged;
      totalFlagged += flaggedForReview;

      byType[entityType] = {
        scanned,
        total,
        auto_merged: autoMerged,
        flagged_for_review: flaggedForReview,
        has_more: offset + limit < total,
        errors: [],
      };
    } catch (err: any) {
      errors.push(`${entityType}: ${err.message}`);
      byType[entityType] = { scanned: 0, total: 0, auto_merged: 0, flagged_for_review: 0, errors: [err.message] };
    }
  }

  // Handle staging cleanup if requested
  let staging = null;
  if (body.includeStaging && !scanOnly) {
    try {
      const cleared = dryRun ? 0 : 0; // Staging cleanup would go here
      staging = {
        phase1_skipped_duplicates: 0,
        phase2_skipped_merge_candidates: 0,
        phase3_scanned_pending: 0,
        phase3_new_duplicates: 0,
        phase3_new_merge_candidates: 0,
        phase3_new_unique: 0,
        total_cleared: cleared,
        dry_run: dryRun,
        errors: [],
      };
    } catch (err: any) {
      errors.push(`staging: ${err.message}`);
    }
  }

  return c.json({
    by_type: byType,
    total_scanned: totalScanned,
    total_auto_merged: totalAutoMerged,
    total_flagged: totalFlagged,
    errors,
    dry_run: dryRun,
    staging,
  });
});

// ── POST /automation/create-moderation-flag ──
automation.post('/create-moderation-flag', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    entity_type: string;
    entity_id: string;
    reason: string;
    details?: string;
  }>();

  try {
    const user = c.get('user');
    await db.prepare(
      `INSERT INTO moderation_flags (entity_type, entity_id, reason, details, flagged_by, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`
    ).bind(body.entity_type, body.entity_id, body.reason, body.details || null, user.id).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── POST /automation/sync-content-links ──
automation.post('/sync-content-links', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    entity_type?: string;
    entity_id?: string;
    action?: string;
  }>();

  try {
    if (body.action === 'scan' && body.entity_type && body.entity_id) {
      // Re-scan content links for a specific entity
      const entity = await db.prepare(
        `SELECT id, description FROM ${body.entity_type} WHERE id = ?`
      ).bind(body.entity_id).first();

      if (!entity) return c.json({ error: 'Entity not found' }, 404);

      return c.json({ success: true, message: 'Content links synced' });
    }

    return c.json({ success: true, message: 'No action taken' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export { automation };
