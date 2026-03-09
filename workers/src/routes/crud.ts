/**
 * Generic CRUD API — replaces supabase.from('table').select/insert/update/delete
 *
 * GET    /rest/:table            — list / filter rows
 * GET    /rest/:table/:id        — get single row
 * POST   /rest/:table            — insert row(s)
 * PATCH  /rest/:table/:id        — update row
 * DELETE /rest/:table/:id        — delete row
 * POST   /rpc/:function          — call a stored procedure (D1 doesn't have real RPC,
 *                                  so these are implemented as named handlers)
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { optionalAuth, requireAuth } from '../middleware/auth';

const crud = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>();

// Tables that allow public read access (no auth required)
const PUBLIC_READ_TABLES = new Set([
  'venues', 'events', 'news_articles', 'personalities', 'queer_villages',
  'hotels', 'festivals', 'cities', 'countries', 'continents', 'regions',
  'unified_tags', 'tag_categories', 'tag_aliases', 'accessibility_attributes',
  'event_types', 'community_groups', 'marketplace_listings', 'redirects',
  'affiliate_partners', 'profiles',
]);

// Tables that require authentication to write
const AUTH_WRITE_TABLES = new Set([
  'profiles', 'community_posts', 'group_post_likes', 'group_poll_votes',
  'event_attendees', 'event_favorites', 'marketplace_favorites',
  'marketplace_reviews', 'message_reactions', 'mailbox_emails',
  'community_submissions', 'content_flags',
]);

// Tables restricted to admin only
const ADMIN_ONLY_TABLES = new Set([
  'user_roles', 'admin_api_keys', 'admin_edit_log', 'failed_login_attempts',
  'captcha_verifications', 'moderation_flags', 'cms_audit_log',
]);

// Columns that should not be sent to non-owner users
const SENSITIVE_COLUMNS = new Set(['encrypted_password', 'ip_address']);

/** Parse Supabase-style query params into SQL */
function buildWhereClause(params: URLSearchParams): { sql: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of params.entries()) {
    // Skip pagination/ordering params
    if (['select', 'order', 'limit', 'offset', 'count'].includes(key)) continue;

    // Parse operator: column=op.value
    const match = value.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|not)\.(.*)$/);
    if (!match) continue;

    const [, op, val] = match;
    const col = sanitizeIdentifier(key);

    switch (op) {
      case 'eq': conditions.push(`${col} = ?`); values.push(val); break;
      case 'neq': conditions.push(`${col} != ?`); values.push(val); break;
      case 'gt': conditions.push(`${col} > ?`); values.push(val); break;
      case 'gte': conditions.push(`${col} >= ?`); values.push(val); break;
      case 'lt': conditions.push(`${col} < ?`); values.push(val); break;
      case 'lte': conditions.push(`${col} <= ?`); values.push(val); break;
      case 'like': conditions.push(`${col} LIKE ?`); values.push(val); break;
      case 'ilike': conditions.push(`${col} LIKE ? COLLATE NOCASE`); values.push(val); break;
      case 'is': {
        if (val === 'null') conditions.push(`${col} IS NULL`);
        else if (val === 'true') conditions.push(`${col} = 1`);
        else if (val === 'false') conditions.push(`${col} = 0`);
        break;
      }
      case 'in': {
        const items = val.replace(/^\(|\)$/g, '').split(',');
        const placeholders = items.map(() => '?').join(',');
        conditions.push(`${col} IN (${placeholders})`);
        values.push(...items);
        break;
      }
      case 'not': {
        // not.eq.value, not.is.null, etc.
        const innerMatch = val.match(/^(eq|is)\.(.*)$/);
        if (innerMatch) {
          const [, innerOp, innerVal] = innerMatch;
          if (innerOp === 'eq') { conditions.push(`${col} != ?`); values.push(innerVal); }
          else if (innerOp === 'is' && innerVal === 'null') { conditions.push(`${col} IS NOT NULL`); }
        }
        break;
      }
    }
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

function buildOrderClause(params: URLSearchParams): string {
  const order = params.get('order');
  if (!order) return '';

  const parts = order.split(',').map((part) => {
    const [col, dir] = part.trim().split('.');
    const safeCol = sanitizeIdentifier(col);
    const direction = dir === 'desc' ? 'DESC' : 'ASC';
    const nulls = dir === 'desc' ? 'NULLS LAST' : 'NULLS FIRST';
    return `${safeCol} ${direction} ${nulls}`;
  });

  return `ORDER BY ${parts.join(', ')}`;
}

function sanitizeIdentifier(name: string): string {
  // Only allow alphanumeric and underscores
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

function parseSelect(params: URLSearchParams): string {
  const select = params.get('select');
  if (!select || select === '*') return '*';

  return select.split(',')
    .map((col) => sanitizeIdentifier(col.trim()))
    .filter(Boolean)
    .join(', ');
}

/** GET /rest/:table */
crud.get('/:table', optionalAuth, async (c) => {
  const table = sanitizeIdentifier(c.req.param('table')!);
  const user = c.get('user');

  if (!PUBLIC_READ_TABLES.has(table) && !user) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  if (ADMIN_ONLY_TABLES.has(table) && !user?.roles.some((r) => r === 'admin' || r === 'canManageContent')) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const params = new URL(c.req.url).searchParams;
  const select = parseSelect(params);
  const { sql: where, values } = buildWhereClause(params);
  const order = buildOrderClause(params);
  const limit = parseInt(params.get('limit') || '100', 10);
  const offset = parseInt(params.get('offset') || '0', 10);

  // Count query if requested
  let count: number | undefined;
  const countParam = params.get('count');
  if (countParam === 'exact') {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM ${table} ${where}`
    ).bind(...values).first<{ total: number }>();
    count = countResult?.total ?? 0;
  }

  const query = `SELECT ${select} FROM ${table} ${where} ${order} LIMIT ? OFFSET ?`;
  const result = await c.env.DB.prepare(query).bind(...values, limit, offset).all();

  const headers: Record<string, string> = {};
  if (count !== undefined) {
    headers['Content-Range'] = `0-${Math.min(offset + limit, count) - 1}/${count}`;
  }

  return c.json(
    { data: result.results, error: null, count },
    200,
    headers,
  );
});

/** GET /rest/:table/:id */
crud.get('/:table/:id', optionalAuth, async (c) => {
  const table = sanitizeIdentifier(c.req.param('table')!);
  const id = c.req.param('id');
  const user = c.get('user');

  if (!PUBLIC_READ_TABLES.has(table) && !user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const params = new URL(c.req.url).searchParams;
  const select = parseSelect(params);

  const row = await c.env.DB.prepare(
    `SELECT ${select} FROM ${table} WHERE id = ?`
  ).bind(id).first();

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: row, error: null });
});

/** POST /rest/:table */
crud.post('/:table', requireAuth as any, async (c) => {
  const table = sanitizeIdentifier(c.req.param('table')!);
  const user = c.get('user') as AuthUser;

  if (ADMIN_ONLY_TABLES.has(table) && !user.roles.some((r) => r === 'admin')) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const body = await c.req.json();
  const rows = Array.isArray(body) ? body : [body];
  const results: unknown[] = [];

  for (const row of rows) {
    // Auto-set id if not provided
    if (!row.id) row.id = crypto.randomUUID();
    if (!row.created_at) row.created_at = new Date().toISOString();
    if (!row.updated_at) row.updated_at = new Date().toISOString();

    const cols = Object.keys(row).map(sanitizeIdentifier);
    const placeholders = cols.map(() => '?').join(', ');
    const values = Object.values(row).map((v) =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
    );

    // Handle upsert via Prefer header
    const prefer = c.req.header('Prefer') || '';
    const onConflict = prefer.includes('resolution=merge-duplicates')
      ? `ON CONFLICT(id) DO UPDATE SET ${cols.map((col) => `${col} = excluded.${col}`).join(', ')}`
      : '';

    await c.env.DB.prepare(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ${onConflict}`
    ).bind(...values).run();

    results.push(row);
  }

  return c.json({ data: results.length === 1 ? results[0] : results, error: null }, 201);
});

/** PATCH /rest/:table/:id */
crud.patch('/:table/:id', requireAuth as any, async (c) => {
  const table = sanitizeIdentifier(c.req.param('table')!);
  const id = c.req.param('id');
  const user = c.get('user') as AuthUser;

  if (ADMIN_ONLY_TABLES.has(table) && !user.roles.some((r) => r === 'admin')) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const body = await c.req.json();
  body.updated_at = new Date().toISOString();

  const cols = Object.keys(body).map(sanitizeIdentifier);
  const setClauses = cols.map((col) => `${col} = ?`).join(', ');
  const values = Object.values(body).map((v) =>
    typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
  );

  await c.env.DB.prepare(
    `UPDATE ${table} SET ${setClauses} WHERE id = ?`
  ).bind(...values, id).run();

  return c.json({ data: { id, ...body }, error: null });
});

/** DELETE /rest/:table/:id */
crud.delete('/:table/:id', requireAuth as any, async (c) => {
  const table = sanitizeIdentifier(c.req.param('table')!);
  const id = c.req.param('id');
  const user = c.get('user') as AuthUser;

  if (ADMIN_ONLY_TABLES.has(table) && !user.roles.some((r) => r === 'admin')) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return c.json({ data: null, error: null });
});

export { crud };
