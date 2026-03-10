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
  'affiliate_partners', 'profiles', 'unified_tag_assignments',
  'cms_content', 'cms_pages', 'videos', 'video_renditions',
  'event_amenities', 'event_services', 'venue_amenities', 'venue_categories',
  'venue_services', 'target_groups', 'community_posts', 'post_comments',
]);

// Tables that require authentication to write
const AUTH_WRITE_TABLES = new Set([
  'profiles', 'community_posts', 'group_post_likes', 'group_poll_votes',
  'event_attendees', 'event_favorites', 'marketplace_favorites',
  'marketplace_reviews', 'message_reactions', 'mailbox_emails',
  'community_submissions', 'content_flags', 'user_passkey_enrollment',
]);

// Tables restricted to admin only
const ADMIN_ONLY_TABLES = new Set([
  'user_roles', 'admin_api_keys', 'admin_edit_log', 'failed_login_attempts',
  'captcha_verifications', 'moderation_flags', 'cms_audit_log',
  'audio_files', 'content_links', 'access_logs',
  'content_changes', 'automation_modules',
]);

// Columns that should not be sent to non-owner users
const SENSITIVE_COLUMNS = new Set(['encrypted_password', 'ip_address']);

/** Singularize a table name for FK column inference (e.g. "cities" → "city") */
function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';  // cities → city
  if (word.endsWith('ses')) return word.slice(0, -2);          // addresses → address
  if (word.endsWith('ves')) return word.slice(0, -3) + 'f';   // wolves → wolf
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1); // events → event
  return word;
}

function sanitizeIdentifier(name: string): string {
  // Only allow alphanumeric and underscores
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

/** Parse a single PostgREST-style filter condition into SQL */
function parseCondition(
  column: string,
  value: string,
  values: unknown[],
): string | null {
  const match = value.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|not)\.(.*)$/);
  if (!match) return null;

  const [, op, val] = match;
  const col = sanitizeIdentifier(column);

  switch (op) {
    case 'eq': values.push(val); return `${col} = ?`;
    case 'neq': values.push(val); return `${col} != ?`;
    case 'gt': values.push(val); return `${col} > ?`;
    case 'gte': values.push(val); return `${col} >= ?`;
    case 'lt': values.push(val); return `${col} < ?`;
    case 'lte': values.push(val); return `${col} <= ?`;
    case 'like': values.push(val); return `${col} LIKE ?`;
    case 'ilike': values.push(val); return `${col} LIKE ? COLLATE NOCASE`;
    case 'is': {
      if (val === 'null') return `${col} IS NULL`;
      if (val === 'true') return `${col} = 1`;
      if (val === 'false') return `${col} = 0`;
      return null;
    }
    case 'in': {
      const items = val.replace(/^\(|\)$/g, '').split(',');
      const placeholders = items.map(() => '?').join(',');
      values.push(...items);
      return `${col} IN (${placeholders})`;
    }
    case 'ov': {
      // overlaps — check if JSON array column shares any values with the given set
      const items = val.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
      if (items.length === 0) return null;
      const placeholders = items.map(() => '?').join(',');
      values.push(...items);
      return `EXISTS (SELECT 1 FROM json_each(${col}) je WHERE je.value IN (${placeholders}))`;
    }
    case 'cs': {
      // contains — check if JSON array column contains ALL given values
      const items = val.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
      if (items.length === 0) return null;
      const parts: string[] = [];
      for (const item of items) {
        values.push(item);
        parts.push(`EXISTS (SELECT 1 FROM json_each(${col}) je WHERE je.value = ?)`);
      }
      return parts.join(' AND ');
    }
    case 'cd': {
      // contained_by — not commonly used, approximate with overlaps
      const items = val.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
      if (items.length === 0) return null;
      const placeholders = items.map(() => '?').join(',');
      values.push(...items);
      return `NOT EXISTS (SELECT 1 FROM json_each(${col}) je WHERE je.value NOT IN (${placeholders}))`;
    }
    case 'not': {
      const innerMatch = val.match(/^(eq|is|in)\.(.*)$/);
      if (innerMatch) {
        const [, innerOp, innerVal] = innerMatch;
        if (innerOp === 'eq') { values.push(innerVal); return `${col} != ?`; }
        if (innerOp === 'is' && innerVal === 'null') return `${col} IS NOT NULL`;
        if (innerOp === 'in') {
          const items = innerVal.replace(/^\(|\)$/g, '').split(',');
          const placeholders = items.map(() => '?').join(',');
          values.push(...items);
          return `${col} NOT IN (${placeholders})`;
        }
      }
      return null;
    }
    default: return null;
  }
}

/** Parse the `or` param: "title.ilike.%foo%,description.ilike.%bar%" → SQL OR group */
function parseOrFilter(orParam: string, values: unknown[]): string | null {
  // Split on commas that are NOT inside parentheses (for nested and(...))
  const parts = splitOrConditions(orParam);
  const orConditions: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    // Handle nested and(...) groups
    const andMatch = trimmed.match(/^and\((.+)\)$/);
    if (andMatch) {
      const innerParts = splitOrConditions(andMatch[1]);
      const andConditions: string[] = [];
      for (const inner of innerParts) {
        const cond = parseOrConditionPart(inner.trim(), values);
        if (cond) andConditions.push(cond);
      }
      if (andConditions.length > 0) {
        orConditions.push(`(${andConditions.join(' AND ')})`);
      }
      continue;
    }

    const cond = parseOrConditionPart(trimmed, values);
    if (cond) orConditions.push(cond);
  }

  if (orConditions.length === 0) return null;
  return `(${orConditions.join(' OR ')})`;
}

/** Parse a single "column.op.value" condition from an or/and group */
function parseOrConditionPart(part: string, values: unknown[]): string | null {
  // Format: column.op.value  e.g. "title.ilike.%foo%"
  // Also handle: column.not.op.value  e.g. "city_id.not.is.null"
  const dotIdx = part.indexOf('.');
  if (dotIdx < 0) return null;

  const column = part.substring(0, dotIdx);
  const rest = part.substring(dotIdx + 1);

  return parseCondition(column, rest, values);
}

/** Split or-filter string on commas, respecting parentheses */
function splitOrConditions(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of input) {
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) { parts.push(current); current = ''; }
    else { current += ch; }
  }

  if (current) parts.push(current);
  return parts;
}

/** Parse Supabase-style query params into SQL WHERE clause */
function buildWhereClause(params: URLSearchParams): { sql: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of params.entries()) {
    // Skip non-filter params
    if (['select', 'order', 'limit', 'offset', 'count', 'or'].includes(key)) continue;

    const cond = parseCondition(key, value, values);
    if (cond) conditions.push(cond);
  }

  // Handle `or` param
  const orParam = params.get('or');
  if (orParam) {
    const orClause = parseOrFilter(orParam, values);
    if (orClause) conditions.push(orClause);
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

function buildOrderClause(params: URLSearchParams, tableAlias?: string): string {
  const order = params.get('order');
  if (!order) return '';

  const prefix = tableAlias ? `${tableAlias}.` : '';
  const parts = order.split(',').map((part) => {
    const segments = part.trim().split('.');
    const col = sanitizeIdentifier(segments[0]);
    const dir = segments.includes('desc') ? 'DESC' : 'ASC';
    const hasNullsFirst = segments.includes('nullsfirst');
    const hasNullsLast = segments.includes('nullslast');
    let nulls: string;
    if (hasNullsFirst) nulls = 'NULLS FIRST';
    else if (hasNullsLast) nulls = 'NULLS LAST';
    else nulls = dir === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';
    return `${prefix}${col} ${dir} ${nulls}`;
  });

  return `ORDER BY ${parts.join(', ')}`;
}

/** Parsed FK join from a select string */
interface JoinSpec {
  alias: string;       // e.g. "cities" in "cities:city_id(id, name)"
  fkColumn: string;    // e.g. "city_id"
  joinTable: string;   // e.g. "cities" (same as alias, or the FK table)
  columns: string[];   // e.g. ["id", "name"]
  isInner: boolean;    // true if !inner syntax was used
}

/**
 * Parse a PostgREST-style select string into simple columns + FK join specs.
 *
 * Examples:
 *   "*" → { columns: "*", joins: [] }
 *   "id, name, cities:city_id(id, name)" → { columns: "id, name", joins: [...] }
 *   "*, countries (id, name)" → { columns: "*", joins: [...] }
 *   "unified_tags!inner(name, color)" → { columns: "", joins: [...] }
 */
function parseSelectWithJoins(params: URLSearchParams): { columns: string; joins: JoinSpec[] } {
  const select = params.get('select');
  if (!select || select === '*') return { columns: '*', joins: [] };

  const joins: JoinSpec[] = [];
  const plainCols: string[] = [];

  // Split at top-level commas (respecting parentheses)
  const parts = splitOrConditions(select);

  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;

    // Pattern 1: alias:fk_column(col1, col2)
    const fkMatch = part.match(/^(\w+):(\w+)\(([^)]+)\)$/);
    if (fkMatch) {
      const [, alias, fkColumn, colsStr] = fkMatch;
      joins.push({
        alias,
        fkColumn,
        joinTable: alias,
        columns: colsStr.split(',').map((c) => sanitizeIdentifier(c.trim())).filter(Boolean),
        isInner: false,
      });
      continue;
    }

    // Pattern 2: table!inner(col1, col2)
    const innerMatch = part.match(/^(\w+)!inner\(([^)]+)\)$/);
    if (innerMatch) {
      const [, table, colsStr] = innerMatch;
      joins.push({
        alias: table,
        fkColumn: '', // will be inferred
        joinTable: table,
        columns: colsStr.split(',').map((c) => sanitizeIdentifier(c.trim())).filter(Boolean),
        isInner: true,
      });
      continue;
    }

    // Pattern 3: table (col1, col2) — space before parens
    const spaceMatch = part.match(/^(\w+)\s+\(([^)]+)\)$/);
    if (spaceMatch) {
      const [, table, colsStr] = spaceMatch;
      joins.push({
        alias: table,
        fkColumn: '', // will be inferred
        joinTable: table,
        columns: colsStr.split(',').map((c) => sanitizeIdentifier(c.trim())).filter(Boolean),
        isInner: false,
      });
      continue;
    }

    // Pattern 4: alias:fk_column!inner(col1, col2)
    const fkInnerMatch = part.match(/^(\w+):(\w+)!inner\(([^)]+)\)$/);
    if (fkInnerMatch) {
      const [, alias, fkColumn, colsStr] = fkInnerMatch;
      joins.push({
        alias,
        fkColumn,
        joinTable: alias,
        columns: colsStr.split(',').map((c) => sanitizeIdentifier(c.trim())).filter(Boolean),
        isInner: true,
      });
      continue;
    }

    // Plain column
    const safeCol = sanitizeIdentifier(part);
    if (safeCol) plainCols.push(safeCol);
  }

  return {
    columns: plainCols.length === 0 && joins.length > 0 ? '*' : (plainCols.join(', ') || '*'),
    joins,
  };
}

/** Execute a query with optional FK joins, nesting joined data in the response */
async function executeWithJoins(
  db: D1Database,
  table: string,
  columns: string,
  joins: JoinSpec[],
  where: string,
  whereValues: unknown[],
  order: string,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  if (joins.length === 0) {
    // Simple query, no joins
    const query = `SELECT ${columns} FROM ${table} ${where} ${order} LIMIT ? OFFSET ?`;
    const result = await db.prepare(query).bind(...whereValues, limit, offset).all();
    return result.results as Record<string, unknown>[];
  }

  // Build the main query first
  const mainSelect = columns === '*' ? `${table}.*` : columns.split(',').map((c) => `${table}.${c.trim()}`).join(', ');
  const query = `SELECT ${mainSelect} FROM ${table} ${where} ${order} LIMIT ? OFFSET ?`;
  const mainResult = await db.prepare(query).bind(...whereValues, limit, offset).all();
  const rows = mainResult.results as Record<string, unknown>[];

  if (rows.length === 0) return rows;

  // For each join, fetch related data and nest it
  for (const join of joins) {
    const fkCol = join.fkColumn || `${singularize(join.joinTable)}_id`;
    const fkValues = [...new Set(rows.map((r) => r[fkCol]).filter((v) => v != null))];

    if (fkValues.length === 0) {
      // Set all to null
      for (const row of rows) {
        row[join.alias] = null;
      }
      continue;
    }

    const placeholders = fkValues.map(() => '?').join(',');
    const joinCols = join.columns.join(', ');
    const joinQuery = `SELECT id, ${joinCols} FROM ${sanitizeIdentifier(join.joinTable)} WHERE id IN (${placeholders})`;
    const joinResult = await db.prepare(joinQuery).bind(...fkValues).all();

    // Build lookup map
    const lookup = new Map<string, Record<string, unknown>>();
    for (const jr of joinResult.results as Record<string, unknown>[]) {
      lookup.set(String(jr.id), jr);
    }

    // Nest into main rows
    for (const row of rows) {
      const fkValue = row[fkCol];
      const joined = fkValue != null ? lookup.get(String(fkValue)) || null : null;
      row[join.alias] = joined;
    }

    // For inner joins, filter out rows without a match
    if (join.isInner) {
      const filtered = rows.filter((r) => r[join.alias] != null);
      rows.length = 0;
      rows.push(...filtered);
    }
  }

  return rows;
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
  const { columns, joins } = parseSelectWithJoins(params);
  const { sql: where, values } = buildWhereClause(params);
  const order = buildOrderClause(params, joins.length > 0 ? table : undefined);
  const limit = parseInt(params.get('limit') || '100', 10);
  const offset = parseInt(params.get('offset') || '0', 10);

  const results = await executeWithJoins(
    c.env.DB, table, columns, joins, where, values, order, limit, offset,
  );

  // Count query if requested — runs after joins so inner joins are accounted for
  let count: number | undefined;
  const countParam = params.get('count');
  if (countParam === 'exact') {
    const innerJoins = joins.filter((j) => j.isInner);
    if (innerJoins.length > 0) {
      // Build count with inner joins to get accurate filtered count
      let countSql = `SELECT COUNT(*) as total FROM ${table}`;
      const countValues = [...values];
      for (const join of innerJoins) {
        const fkCol = join.fkColumn || `${singularize(join.joinTable)}_id`;
        const joinTableSafe = sanitizeIdentifier(join.joinTable);
        countSql += ` INNER JOIN ${joinTableSafe} ON ${table}.${fkCol} = ${joinTableSafe}.id`;
      }
      countSql += ` ${where}`;
      const countResult = await c.env.DB.prepare(countSql).bind(...countValues).first<{ total: number }>();
      count = countResult?.total ?? 0;
    } else {
      const countResult = await c.env.DB.prepare(
        `SELECT COUNT(*) as total FROM ${table} ${where}`
      ).bind(...values).first<{ total: number }>();
      count = countResult?.total ?? 0;
    }
  }

  const headers: Record<string, string> = {};
  if (count !== undefined) {
    headers['Content-Range'] = `0-${Math.min(offset + limit, count) - 1}/${count}`;
  }

  return c.json(
    { data: results, error: null, count },
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
  const { columns, joins } = parseSelectWithJoins(params);

  if (joins.length > 0) {
    const results = await executeWithJoins(
      c.env.DB, table, columns, joins, 'WHERE id = ?', [id], '', 1, 0,
    );
    if (results.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json({ data: results[0], error: null });
  }

  const row = await c.env.DB.prepare(
    `SELECT ${columns} FROM ${table} WHERE id = ?`
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

/** PATCH /rest/:table — bulk update with query-param-based WHERE */
crud.patch('/:table', requireAuth as any, async (c) => {
  const table = sanitizeIdentifier(c.req.param('table')!);
  const user = c.get('user') as AuthUser;

  if (ADMIN_ONLY_TABLES.has(table) && !user.roles.some((r) => r === 'admin')) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const params = new URL(c.req.url).searchParams;
  const { sql: where, values: whereValues } = buildWhereClause(params);

  // If an `id` filter resolves to a single eq, also support the legacy path
  // But primarily this handles bulk updates via query params

  const body = await c.req.json();
  body.updated_at = new Date().toISOString();

  const cols = Object.keys(body).map(sanitizeIdentifier);
  const setClauses = cols.map((col) => `${col} = ?`).join(', ');
  const setValues = Object.values(body).map((v) =>
    typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
  );

  if (!where) {
    return c.json({ error: 'WHERE clause required for bulk update' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE ${table} SET ${setClauses} ${where}`
  ).bind(...setValues, ...whereValues).run();

  // Return updated rows if select param is present
  const selectParam = params.get('select');
  if (selectParam) {
    const selectCols = selectParam === '*' ? '*' : selectParam.split(',').map((s) => sanitizeIdentifier(s.trim())).join(', ');
    const result = await c.env.DB.prepare(
      `SELECT ${selectCols} FROM ${table} ${where}`
    ).bind(...whereValues).all();
    return c.json({ data: result.results, error: null });
  }

  return c.json({ data: null, error: null });
});

/** DELETE /rest/:table — bulk delete with query-param-based WHERE */
crud.delete('/:table', requireAuth as any, async (c) => {
  const table = sanitizeIdentifier(c.req.param('table')!);
  const user = c.get('user') as AuthUser;

  if (ADMIN_ONLY_TABLES.has(table) && !user.roles.some((r) => r === 'admin')) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const params = new URL(c.req.url).searchParams;
  const { sql: where, values: whereValues } = buildWhereClause(params);

  if (!where) {
    return c.json({ error: 'WHERE clause required for bulk delete' }, 400);
  }

  // Optionally return deleted rows before deleting
  const selectParam = params.get('select');
  let deletedRows: unknown[] | null = null;
  if (selectParam) {
    const selectCols = selectParam === '*' ? '*' : selectParam.split(',').map((s) => sanitizeIdentifier(s.trim())).join(', ');
    const result = await c.env.DB.prepare(
      `SELECT ${selectCols} FROM ${table} ${where}`
    ).bind(...whereValues).all();
    deletedRows = result.results;
  }

  await c.env.DB.prepare(`DELETE FROM ${table} ${where}`).bind(...whereValues).run();
  return c.json({ data: deletedRows, error: null });
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

  // Return updated row if select param is present
  const params = new URL(c.req.url).searchParams;
  const selectParam = params.get('select');
  if (selectParam) {
    const selectCols = selectParam === '*' ? '*' : selectParam.split(',').map((s) => sanitizeIdentifier(s.trim())).join(', ');
    const row = await c.env.DB.prepare(
      `SELECT ${selectCols} FROM ${table} WHERE id = ?`
    ).bind(id).first();
    return c.json({ data: row, error: null });
  }

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
