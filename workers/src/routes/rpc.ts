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
  const { search_lat, search_lng, search_radius } = await c.req.json();
  const radius = search_radius || 50;
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
  const { other_user_id } = await c.req.json();

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
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    body.p_user_id,
    body.p_type,
    body.p_title,
    body.p_message,
    JSON.stringify(body.p_data || {}),
    new Date().toISOString(),
  ).run();
  return c.json({ data: null, error: null });
});

rpc.post('/validate_file_upload', async (c) => {
  const { p_file_name, p_file_size, p_mime_type } = await c.req.json();
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
  const { p_identifier, p_action, p_max_attempts, p_window_minutes } = await c.req.json();
  const key = `ratelimit:${p_action}:${p_identifier}`;
  const current = parseInt(await c.env.CACHE.get(key) || '0', 10);
  const allowed = current < (p_max_attempts || 10);

  if (allowed) {
    await c.env.CACHE.put(key, String(current + 1), {
      expirationTtl: (p_window_minutes || 15) * 60,
    });
  }

  return c.json({
    data: { allowed, remaining: Math.max(0, (p_max_attempts || 10) - current - 1) },
    error: null,
  });
});

rpc.post('/get_public_profile_safe', async (c) => {
  const { p_user_id } = await c.req.json();
  const profile = await c.env.DB.prepare(
    `SELECT p.id, p.display_name, p.bio, p.avatar_url, p.pronouns, p.location, p.is_business, p.created_at
     FROM profiles p WHERE p.user_id = ?`
  ).bind(p_user_id).first();
  return c.json({ data: profile, error: null });
});

rpc.post('/validate_password_enhanced', async (c) => {
  const { p_password } = await c.req.json();
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

// Catch-all for unimplemented RPCs
rpc.post('/:name', async (c) => {
  const name = c.req.param('name');
  console.warn(`Unimplemented RPC: ${name}`);
  return c.json({ data: null, error: `RPC '${name}' not implemented yet` }, 501);
});

export { rpc };
