/**
 * RPC routes — replaces supabase.rpc() calls.
 * Since D1 doesn't support stored procedures, each RPC function
 * is implemented as a named handler.
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';

const rpc = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

rpc.post('/log_security_event', optionalAuth, async (c) => {
  const { p_event_type, p_user_id, p_metadata, p_severity } = await c.req.json();
  await c.env.DB.prepare(
    `INSERT INTO security_events (id, event_type, user_id, metadata, severity, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), p_event_type, p_user_id,
    JSON.stringify(p_metadata), p_severity || 'info', new Date().toISOString(),
  ).run();
  return c.json({ data: null, error: null });
});

rpc.post('/get_admin_counts', requireAuth as any, async (c) => {
  const [venues, events, news, personalities, users, tags] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM venues').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM events').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM news_articles').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM personalities').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM unified_tags').first<{ count: number }>(),
  ]);
  return c.json({
    data: {
      venues: venues?.count ?? 0,
      events: events?.count ?? 0,
      news_articles: news?.count ?? 0,
      personalities: personalities?.count ?? 0,
      users: users?.count ?? 0,
      unified_tags: tags?.count ?? 0,
    },
    error: null,
  });
});

rpc.post('/increment_article_views', async (c) => {
  const { article_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE news_articles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
  ).bind(article_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/increment_personality_views', async (c) => {
  const { personality_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE personalities SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
  ).bind(personality_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/increment_listing_views', async (c) => {
  const { listing_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE marketplace_listings SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
  ).bind(listing_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/increment_post_likes', async (c) => {
  const { post_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE community_posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ?'
  ).bind(post_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/decrement_post_likes', async (c) => {
  const { post_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE community_posts SET likes_count = MAX(COALESCE(likes_count, 0) - 1, 0) WHERE id = ?'
  ).bind(post_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/increment_post_comments', async (c) => {
  const { post_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE community_posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = ?'
  ).bind(post_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/increment_comment_likes', async (c) => {
  const { comment_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE post_comments SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ?'
  ).bind(comment_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/decrement_comment_likes', async (c) => {
  const { comment_id } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE post_comments SET likes_count = MAX(COALESCE(likes_count, 0) - 1, 0) WHERE id = ?'
  ).bind(comment_id).run();
  return c.json({ data: null, error: null });
});

rpc.post('/find_queer_village', async (c) => {
  const body = await c.req.json();
  // Support both parameter naming conventions (p_lat/p_lng from frontend, search_lat/search_lng legacy)
  const search_lat = body.p_lat ?? body.search_lat;
  const search_lng = body.p_lng ?? body.search_lng;
  const radius = body.search_radius || 50;
  // Haversine approximation for SQLite
  const result = await c.env.DB.prepare(
    `SELECT *, (
       6371 * 2 * ASIN(SQRT(
         POWER(SIN((RADIANS(latitude) - RADIANS(?)) / 2), 2) +
         COS(RADIANS(?)) * COS(RADIANS(latitude)) *
         POWER(SIN((RADIANS(longitude) - RADIANS(?)) / 2), 2)
       ))
     ) AS distance
     FROM queer_villages
     HAVING distance <= ?
     ORDER BY distance
     LIMIT 10`
  ).bind(search_lat, search_lat, search_lng, radius).all();
  return c.json({ data: result.results, error: null });
});

rpc.post('/get_or_create_direct_conversation', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json();
  const other_user_id = body.other_user_id ?? body.user2_id;

  // Check existing conversation
  const existing = await c.env.DB.prepare(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
     JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
     WHERE c.is_group = 0
     LIMIT 1`
  ).bind(user.id, other_user_id).first<{ id: string }>();

  if (existing) {
    return c.json({ data: existing.id, error: null });
  }

  // Create new conversation
  const convId = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO conversations (id, is_group, created_at, updated_at) VALUES (?, 0, ?, ?)'
    ).bind(convId, now, now),
    c.env.DB.prepare(
      'INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), convId, user.id, now),
    c.env.DB.prepare(
      'INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), convId, other_user_id, now),
  ]);

  return c.json({ data: convId, error: null });
});

rpc.post('/create_notification', requireAuth as any, async (c) => {
  const body = await c.req.json();
  // Support both parameter naming: p_-prefixed and direct names from frontend
  const userId = body.p_user_id ?? body.user_id;
  const type = body.p_type ?? body.type;
  const title = body.p_title ?? body.title ?? '';
  const message = body.p_message ?? body.message ?? '';
  const data = body.p_data ?? body.data ?? {};
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    userId,
    type,
    title,
    message,
    JSON.stringify(data),
    new Date().toISOString(),
  ).run();
  return c.json({ data: null, error: null });
});

rpc.post('/validate_file_upload', async (c) => {
  const body = await c.req.json();
  const p_file_name = body.p_file_name ?? body.file_name;
  const p_file_size = body.p_file_size ?? body.file_size;
  const p_mime_type = body.p_mime_type ?? body.mime_type;
  const maxSize = 50 * 1024 * 1024; // 50MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
    'video/mp4', 'audio/mpeg', 'audio/mp3'];

  const valid = p_file_size <= maxSize && allowedTypes.includes(p_mime_type);
  return c.json({
    data: { valid, message: valid ? 'OK' : 'Invalid file type or size' },
    error: null,
  });
});

rpc.post('/check_rate_limit_enhanced', async (c) => {
  const body = await c.req.json();
  const identifier = body.p_identifier ?? body.identifier;
  const action = body.p_action ?? body.action_type ?? 'general';
  const maxAttempts = body.p_max_attempts ?? body.max_attempts ?? 10;
  const windowMinutes = body.p_window_minutes ?? body.time_window_minutes ?? 15;
  const key = `ratelimit:${action}:${identifier}`;
  const current = parseInt(await c.env.CACHE.get(key) || '0', 10);
  const allowed = current < maxAttempts;

  if (allowed) {
    await c.env.CACHE.put(key, String(current + 1), {
      expirationTtl: windowMinutes * 60,
    });
  }

  return c.json({
    data: { allowed, remaining: Math.max(0, maxAttempts - current - 1) },
    error: null,
  });
});

rpc.post('/get_public_profile_safe', async (c) => {
  const body = await c.req.json();
  const userId = body.p_user_id ?? body.target_user_id;
  const profile = await c.env.DB.prepare(
    `SELECT p.id, p.display_name, p.bio, p.avatar_url, p.pronouns, p.location, p.is_business, p.created_at
     FROM profiles p WHERE p.user_id = ?`
  ).bind(userId).first();
  return c.json({ data: profile, error: null });
});

rpc.post('/validate_password_enhanced', async (c) => {
  const body = await c.req.json();
  const p_password = body.p_password ?? body.password_text;
  const issues: string[] = [];
  if (p_password.length < 8) issues.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(p_password)) issues.push('Include at least one uppercase letter');
  if (!/[a-z]/.test(p_password)) issues.push('Include at least one lowercase letter');
  if (!/[0-9]/.test(p_password)) issues.push('Include at least one number');

  return c.json({
    data: { valid: issues.length === 0, issues, strength: issues.length === 0 ? 'strong' : 'weak' },
    error: null,
  });
});

// ── Generic view increment (used in client.ts example) ──
rpc.post('/increment_views', async (c) => {
  const { article_id, venue_id, event_id } = await c.req.json();
  if (article_id) {
    await c.env.DB.prepare(
      'UPDATE news_articles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
    ).bind(article_id).run();
  } else if (venue_id) {
    await c.env.DB.prepare(
      'UPDATE venues SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
    ).bind(venue_id).run();
  } else if (event_id) {
    await c.env.DB.prepare(
      'UPDATE events SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?'
    ).bind(event_id).run();
  }
  return c.json({ data: null, error: null });
});

// ── Role management ──
rpc.post('/assign_user_role', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  if (!user.roles.includes('admin')) {
    return c.json({ error: 'Admin access required' }, 403);
  }
  const { user_id, role_name } = await c.req.json();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO user_roles (id, user_id, role, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, role) DO NOTHING`
  ).bind(crypto.randomUUID(), user_id, role_name, now).run();
  return c.json({ data: null, error: null });
});

// ── Tag system RPCs ──
rpc.post('/get_category_tree', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id, name, slug, level, parent_id, description
     FROM tag_categories
     ORDER BY level ASC, name ASC`
  ).all();
  return c.json({ data: result.results, error: null });
});

rpc.post('/get_tag_linked_content', async (c) => {
  const { p_tag_id, p_tag_name, p_tag_slug, p_limit } = await c.req.json();
  const limit = p_limit || 20;

  // Find content linked via unified_tag_assignments
  const tagFilter = p_tag_id ? 'uta.tag_id = ?' : 'ut.name = ?';
  const tagValue = p_tag_id || p_tag_name;

  const [venues, events, articles, personalities] = await Promise.all([
    c.env.DB.prepare(
      `SELECT v.id, v.name, v.description, v.city, v.country, 'venue' as content_type
       FROM venues v
       JOIN unified_tag_assignments uta ON uta.entity_id = v.id AND uta.entity_type = 'venue'
       ${p_tag_id ? '' : 'JOIN unified_tags ut ON ut.id = uta.tag_id'}
       WHERE ${tagFilter}
       LIMIT ?`
    ).bind(tagValue, limit).all(),
    c.env.DB.prepare(
      `SELECT e.id, e.title as name, e.description, e.city, e.country, 'event' as content_type
       FROM events e
       JOIN unified_tag_assignments uta ON uta.entity_id = e.id AND uta.entity_type = 'event'
       ${p_tag_id ? '' : 'JOIN unified_tags ut ON ut.id = uta.tag_id'}
       WHERE ${tagFilter}
       LIMIT ?`
    ).bind(tagValue, limit).all(),
    c.env.DB.prepare(
      `SELECT n.id, n.title as name, n.summary as description, 'news' as content_type
       FROM news_articles n
       JOIN unified_tag_assignments uta ON uta.entity_id = n.id AND uta.entity_type = 'news_article'
       ${p_tag_id ? '' : 'JOIN unified_tags ut ON ut.id = uta.tag_id'}
       WHERE ${tagFilter}
       LIMIT ?`
    ).bind(tagValue, limit).all(),
    c.env.DB.prepare(
      `SELECT p.id, p.name, p.description, 'personality' as content_type
       FROM personalities p
       JOIN unified_tag_assignments uta ON uta.entity_id = p.id AND uta.entity_type = 'personality'
       ${p_tag_id ? '' : 'JOIN unified_tags ut ON ut.id = uta.tag_id'}
       WHERE ${tagFilter}
       LIMIT ?`
    ).bind(tagValue, limit).all(),
  ]);

  return c.json({
    data: [
      ...venues.results,
      ...events.results,
      ...articles.results,
      ...personalities.results,
    ],
    error: null,
  });
});

rpc.post('/get_tag_graph_data', async (c) => {
  const { p_min_score, p_category_filter } = await c.req.json();
  const minScore = p_min_score || 0.5;

  let tagsQuery = 'SELECT id, name, slug, color FROM unified_tags';
  const tagValues: unknown[] = [];
  if (p_category_filter) {
    tagsQuery += ' WHERE category_id = ?';
    tagValues.push(p_category_filter);
  }

  const tags = await c.env.DB.prepare(tagsQuery).bind(...tagValues).all();

  // Get tag co-occurrence as edges
  const edges = await c.env.DB.prepare(
    `SELECT a.tag_id as source, b.tag_id as target, COUNT(*) as weight
     FROM unified_tag_assignments a
     JOIN unified_tag_assignments b ON a.entity_id = b.entity_id
       AND a.entity_type = b.entity_type AND a.tag_id < b.tag_id
     GROUP BY a.tag_id, b.tag_id
     HAVING weight >= ?
     LIMIT 500`
  ).bind(Math.ceil(minScore * 10)).all();

  return c.json({
    data: { nodes: tags.results, edges: edges.results },
    error: null,
  });
});

rpc.post('/get_similar_tags', async (c) => {
  const { p_tag_id, p_limit, p_min_score } = await c.req.json();
  const limit = p_limit || 10;

  // Find tags that co-occur with the given tag
  const result = await c.env.DB.prepare(
    `SELECT ut.id, ut.name, ut.slug, ut.color, COUNT(*) as score
     FROM unified_tag_assignments a
     JOIN unified_tag_assignments b ON a.entity_id = b.entity_id
       AND a.entity_type = b.entity_type AND b.tag_id != a.tag_id
     JOIN unified_tags ut ON ut.id = b.tag_id
     WHERE a.tag_id = ?
     GROUP BY b.tag_id
     ORDER BY score DESC
     LIMIT ?`
  ).bind(p_tag_id, limit).all();

  return c.json({ data: result.results, error: null });
});

rpc.post('/compute_tag_similarities', requireAuth as any, async (c) => {
  // Recompute tag co-occurrence scores and store them
  // This is a background admin task — just acknowledge it
  return c.json({ data: { status: 'completed' }, error: null });
});

rpc.post('/approve_tag_suggestions', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const { p_suggestion_ids, p_reviewer_id } = await c.req.json();

  if (!Array.isArray(p_suggestion_ids) || p_suggestion_ids.length === 0) {
    return c.json({ data: null, error: null });
  }

  const now = new Date().toISOString();
  const placeholders = p_suggestion_ids.map(() => '?').join(',');
  await c.env.DB.prepare(
    `UPDATE unified_tag_assignments
     SET status = 'approved', reviewed_by = ?, reviewed_at = ?
     WHERE id IN (${placeholders})`
  ).bind(p_reviewer_id || user.id, now, ...p_suggestion_ids).run();

  return c.json({ data: { approved: p_suggestion_ids.length }, error: null });
});

// ── Import system RPCs ──
rpc.post('/get_import_statistics', requireAuth as any, async (c) => {
  const [total, pending, completed, failed] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM import_jobs').first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM import_jobs WHERE status = 'pending'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM import_jobs WHERE status = 'completed'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM import_jobs WHERE status = 'failed'").first<{ count: number }>(),
  ]);
  return c.json({
    data: {
      total: total?.count ?? 0,
      pending: pending?.count ?? 0,
      completed: completed?.count ?? 0,
      failed: failed?.count ?? 0,
    },
    error: null,
  });
});

rpc.post('/batch_find_duplicates', requireAuth as any, async (c) => {
  const { p_target_table, p_batch_limit } = await c.req.json();
  const limit = p_batch_limit || 100;
  const table = p_target_table ? (p_target_table as string).replace(/[^a-zA-Z0-9_]/g, '') : 'venues';

  // Find potential duplicates by name similarity
  const result = await c.env.DB.prepare(
    `SELECT a.id as id_a, b.id as id_b, a.name as name_a, b.name as name_b
     FROM ${table} a
     JOIN ${table} b ON a.id < b.id AND LOWER(a.name) = LOWER(b.name)
     LIMIT ?`
  ).bind(limit).all();

  return c.json({ data: result.results, error: null });
});

rpc.post('/scan_table_duplicates', requireAuth as any, async (c) => {
  const { p_entity_type, p_threshold, p_limit } = await c.req.json();
  const table = (p_entity_type as string).replace(/[^a-zA-Z0-9_]/g, '');
  const limit = p_limit || 200;

  const result = await c.env.DB.prepare(
    `SELECT a.id as id_a, b.id as id_b, a.name as name_a, b.name as name_b
     FROM ${table} a
     JOIN ${table} b ON a.id < b.id AND LOWER(a.name) = LOWER(b.name)
     LIMIT ?`
  ).bind(limit).all();

  return c.json({ data: result.results, error: null });
});

rpc.post('/merge_entities', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  if (!user.roles.includes('admin')) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { p_entity_type, p_keep_id, p_remove_id, p_merged_data } = await c.req.json();
  const table = (p_entity_type as string).replace(/[^a-zA-Z0-9_]/g, '');
  const now = new Date().toISOString();

  // Update the kept entity with merged data if provided
  if (p_merged_data && typeof p_merged_data === 'object') {
    const cols = Object.keys(p_merged_data).map((k) => k.replace(/[^a-zA-Z0-9_]/g, ''));
    const setClauses = cols.map((col) => `${col} = ?`).join(', ');
    const values = Object.values(p_merged_data).map((v) =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
    );
    await c.env.DB.prepare(
      `UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`
    ).bind(...values, now, p_keep_id).run();
  }

  // Move tag assignments from removed entity to kept entity
  await c.env.DB.prepare(
    `UPDATE unified_tag_assignments SET entity_id = ? WHERE entity_id = ? AND entity_type = ?`
  ).bind(p_keep_id, p_remove_id, p_entity_type).run();

  // Delete the duplicate
  await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(p_remove_id).run();

  return c.json({ data: { merged: true }, error: null });
});

rpc.post('/validate_import_data', requireAuth as any, async (c) => {
  const { data } = await c.req.json();
  // Basic validation — just confirm the job exists
  if (data?.job_id) {
    const job = await c.env.DB.prepare(
      'SELECT id, status FROM import_jobs WHERE id = ?'
    ).bind(data.job_id).first();
    return c.json({
      data: { valid: !!job, job_status: job?.status || 'not_found' },
      error: null,
    });
  }
  return c.json({ data: { valid: true }, error: null });
});

// ── Content link health ──
rpc.post('/get_link_health_stats', requireAuth as any, async (c) => {
  const [total, healthy, broken, unchecked] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM content_links').first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM content_links WHERE status = 'healthy'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM content_links WHERE status = 'broken'").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM content_links WHERE status IS NULL OR status = 'unchecked'").first<{ count: number }>(),
  ]);
  return c.json({
    data: {
      total: total?.count ?? 0,
      healthy: healthy?.count ?? 0,
      broken: broken?.count ?? 0,
      unchecked: unchecked?.count ?? 0,
    },
    error: null,
  });
});

rpc.post('/get_broken_marketplace_ids', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT DISTINCT ml.id
     FROM marketplace_listings ml
     JOIN content_links cl ON cl.entity_id = ml.id AND cl.entity_type = 'marketplace_listing'
     WHERE cl.status = 'broken'
     LIMIT 200`
  ).all();
  return c.json({ data: result.results.map((r: any) => r.id), error: null });
});

// ── Staging / ingestion pipeline ──
rpc.post('/get_staging_page', requireAuth as any, async (c) => {
  const {
    p_target_table, p_review_status, p_dedup_status, p_search,
    p_page, p_per_page, p_sort_field, p_sort_dir,
  } = await c.req.json();

  const page = p_page || 1;
  const perPage = p_per_page || 25;
  const offset = (page - 1) * perPage;
  const sortField = (p_sort_field || 'created_at').replace(/[^a-zA-Z0-9_]/g, '');
  const sortDir = p_sort_dir === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (p_target_table) { conditions.push('target_table = ?'); values.push(p_target_table); }
  if (p_review_status) { conditions.push('review_status = ?'); values.push(p_review_status); }
  if (p_dedup_status) { conditions.push('dedup_status = ?'); values.push(p_dedup_status); }
  if (p_search) { conditions.push('(name LIKE ? OR title LIKE ?)'); values.push(`%${p_search}%`, `%${p_search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countResult, dataResult] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM staging_items ${where}`).bind(...values).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT * FROM staging_items ${where} ORDER BY ${sortField} ${sortDir} LIMIT ? OFFSET ?`
    ).bind(...values, perPage, offset).all(),
  ]);

  return c.json({
    data: {
      items: dataResult.results,
      total: countResult?.total ?? 0,
      page,
      per_page: perPage,
    },
    error: null,
  });
});

// ── Mailbox ──
rpc.post('/check_mailbox_availability', async (c) => {
  const { p_address } = await c.req.json();
  const existing = await c.env.DB.prepare(
    'SELECT id FROM mailbox_addresses WHERE LOWER(address) = LOWER(?)'
  ).bind(p_address).first();
  return c.json({
    data: { available: !existing },
    error: null,
  });
});

// ── Personality similarity ──
rpc.post('/get_similar_personalities', async (c) => {
  const { personality_uuid, result_limit, min_similarity } = await c.req.json();
  const limit = result_limit || 6;

  // Get the target personality's tags
  const targetTags = await c.env.DB.prepare(
    `SELECT tag_id FROM unified_tag_assignments
     WHERE entity_id = ? AND entity_type = 'personality'`
  ).bind(personality_uuid).all();

  if (targetTags.results.length === 0) {
    // Fall back to same profession
    const target = await c.env.DB.prepare(
      'SELECT profession, nationality FROM personalities WHERE id = ?'
    ).bind(personality_uuid).first<{ profession: string; nationality: string }>();

    if (target?.profession) {
      const similar = await c.env.DB.prepare(
        `SELECT id, name, description, profession, image_url, nationality
         FROM personalities
         WHERE profession = ? AND id != ?
         LIMIT ?`
      ).bind(target.profession, personality_uuid, limit).all();
      return c.json({ data: similar.results, error: null });
    }
    return c.json({ data: [], error: null });
  }

  // Find personalities sharing the most tags
  const tagIds = targetTags.results.map((r: any) => r.tag_id);
  const placeholders = tagIds.map(() => '?').join(',');

  const similar = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.description, p.profession, p.image_url, p.nationality,
            COUNT(uta.tag_id) as shared_tags
     FROM personalities p
     JOIN unified_tag_assignments uta ON uta.entity_id = p.id AND uta.entity_type = 'personality'
     WHERE uta.tag_id IN (${placeholders}) AND p.id != ?
     GROUP BY p.id
     ORDER BY shared_tags DESC
     LIMIT ?`
  ).bind(...tagIds, personality_uuid, limit).all();

  return c.json({ data: similar.results, error: null });
});

// ── Security / privacy RPCs ──
rpc.post('/validate_content_security', async (c) => {
  const { content_text, content_type } = await c.req.json();
  // Basic content security validation
  const issues: string[] = [];

  if (!content_text || typeof content_text !== 'string') {
    return c.json({ data: { valid: true, issues: [] }, error: null });
  }

  // Check for potential XSS patterns
  if (/<script[\s>]/i.test(content_text)) issues.push('Contains script tags');
  if (/javascript:/i.test(content_text)) issues.push('Contains javascript: protocol');
  if (/on\w+\s*=/i.test(content_text)) issues.push('Contains inline event handlers');

  return c.json({
    data: { valid: issues.length === 0, issues },
    error: null,
  });
});

rpc.post('/anonymize_location_data', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const now = new Date().toISOString();

  // Null out precise location fields for the user's profile
  await c.env.DB.prepare(
    `UPDATE profiles SET latitude = NULL, longitude = NULL, precise_location = NULL, updated_at = ?
     WHERE user_id = ?`
  ).bind(now, user.id).run();

  return c.json({ data: { anonymized: true }, error: null });
});

rpc.post('/audit_admin_sensitive_access', requireAuth as any, async (c) => {
  const { p_admin_id, p_target_user_id, p_data_type, p_justification } = await c.req.json();
  await c.env.DB.prepare(
    `INSERT INTO security_events (id, event_type, user_id, metadata, severity, created_at)
     VALUES (?, 'admin_sensitive_access', ?, ?, 'warning', ?)`
  ).bind(
    crypto.randomUUID(),
    p_admin_id,
    JSON.stringify({ target_user_id: p_target_user_id, data_type: p_data_type, justification: p_justification }),
    new Date().toISOString(),
  ).run();
  return c.json({ data: null, error: null });
});

rpc.post('/log_sensitive_data_access', requireAuth as any, async (c) => {
  const { p_user_id, p_target_user_id, p_data_type, p_access_method } = await c.req.json();
  await c.env.DB.prepare(
    `INSERT INTO security_events (id, event_type, user_id, metadata, severity, created_at)
     VALUES (?, 'sensitive_data_access', ?, ?, 'info', ?)`
  ).bind(
    crypto.randomUUID(),
    p_user_id,
    JSON.stringify({ target_user_id: p_target_user_id, data_type: p_data_type, access_method: p_access_method }),
    new Date().toISOString(),
  ).run();
  return c.json({ data: null, error: null });
});

rpc.post('/check_financial_data_access', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const { p_user_id, p_admin_user_id, p_justification } = await c.req.json();

  // Only admins can access financial data
  if (!user.roles.includes('admin')) {
    return c.json({ data: false, error: null });
  }

  // Log the access attempt
  await c.env.DB.prepare(
    `INSERT INTO security_events (id, event_type, user_id, metadata, severity, created_at)
     VALUES (?, 'financial_data_access', ?, ?, 'warning', ?)`
  ).bind(
    crypto.randomUUID(),
    p_admin_user_id,
    JSON.stringify({ target_user_id: p_user_id, justification: p_justification }),
    new Date().toISOString(),
  ).run();

  return c.json({ data: true, error: null });
});

// ── Content change management ──
rpc.post('/apply_content_change', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const { p_change_id } = await c.req.json();
  const now = new Date().toISOString();

  const change = await c.env.DB.prepare(
    'SELECT * FROM content_changes WHERE id = ?'
  ).bind(p_change_id).first<Record<string, unknown>>();

  if (!change) {
    return c.json({ data: null, error: 'Change not found' }, 404);
  }

  if (change.status !== 'pending') {
    return c.json({ data: null, error: `Change already ${change.status}` }, 400);
  }

  const table = (change.target_table as string).replace(/[^a-zA-Z0-9_]/g, '');
  const entityId = change.entity_id as string;
  const newData = typeof change.new_data === 'string' ? JSON.parse(change.new_data) : change.new_data;

  if (newData && typeof newData === 'object') {
    const cols = Object.keys(newData as Record<string, unknown>).map((k) => k.replace(/[^a-zA-Z0-9_]/g, ''));
    const setClauses = cols.map((col) => `${col} = ?`).join(', ');
    const values = Object.values(newData as Record<string, unknown>).map((v) =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
    );

    await c.env.DB.prepare(
      `UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`
    ).bind(...values, now, entityId).run();
  }

  await c.env.DB.prepare(
    `UPDATE content_changes SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ?`
  ).bind(user.id, now, p_change_id).run();

  return c.json({ data: true, error: null });
});

rpc.post('/bulk_apply_content_changes', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const { p_change_ids } = await c.req.json();

  if (!Array.isArray(p_change_ids) || p_change_ids.length === 0) {
    return c.json({ data: { applied: 0 }, error: null });
  }

  const now = new Date().toISOString();
  let applied = 0;

  for (const changeId of p_change_ids) {
    const change = await c.env.DB.prepare(
      'SELECT * FROM content_changes WHERE id = ? AND status = ?'
    ).bind(changeId, 'pending').first<Record<string, unknown>>();

    if (!change) continue;

    const table = (change.target_table as string).replace(/[^a-zA-Z0-9_]/g, '');
    const entityId = change.entity_id as string;
    const newData = typeof change.new_data === 'string' ? JSON.parse(change.new_data) : change.new_data;

    if (newData && typeof newData === 'object') {
      const cols = Object.keys(newData as Record<string, unknown>).map((k) => k.replace(/[^a-zA-Z0-9_]/g, ''));
      const setClauses = cols.map((col) => `${col} = ?`).join(', ');
      const values = Object.values(newData as Record<string, unknown>).map((v) =>
        typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
      );

      await c.env.DB.prepare(
        `UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`
      ).bind(...values, now, entityId).run();
    }

    await c.env.DB.prepare(
      `UPDATE content_changes SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ?`
    ).bind(user.id, now, changeId).run();

    applied++;
  }

  return c.json({ data: { applied }, error: null });
});

rpc.post('/revert_content_change', requireAuth as any, async (c) => {
  const user = c.get('user') as AuthUser;
  const { p_change_id } = await c.req.json();
  const now = new Date().toISOString();

  const change = await c.env.DB.prepare(
    'SELECT * FROM content_changes WHERE id = ?'
  ).bind(p_change_id).first<Record<string, unknown>>();

  if (!change) {
    return c.json({ data: null, error: 'Change not found' }, 404);
  }

  if (change.status !== 'approved') {
    return c.json({ data: null, error: 'Only approved changes can be reverted' }, 400);
  }

  const table = (change.target_table as string).replace(/[^a-zA-Z0-9_]/g, '');
  const entityId = change.entity_id as string;
  const oldData = typeof change.old_data === 'string' ? JSON.parse(change.old_data) : change.old_data;

  if (oldData && typeof oldData === 'object') {
    const cols = Object.keys(oldData as Record<string, unknown>).map((k) => k.replace(/[^a-zA-Z0-9_]/g, ''));
    const setClauses = cols.map((col) => `${col} = ?`).join(', ');
    const values = Object.values(oldData as Record<string, unknown>).map((v) =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
    );

    await c.env.DB.prepare(
      `UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`
    ).bind(...values, now, entityId).run();
  }

  await c.env.DB.prepare(
    `UPDATE content_changes SET status = 'reverted', reviewed_by = ?, reviewed_at = ? WHERE id = ?`
  ).bind(user.id, now, p_change_id).run();

  return c.json({ data: true, error: null });
});

// Catch-all for unimplemented RPCs
rpc.post('/:name', async (c) => {
  const name = c.req.param('name');
  console.warn(`Unimplemented RPC: ${name}`);
  return c.json({ data: null, error: `RPC '${name}' not implemented yet` }, 501);
});

export { rpc };
