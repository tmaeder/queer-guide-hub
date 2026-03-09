/**
 * D1 database helper utilities.
 * Replaces Supabase client patterns like supabase.from().select().eq()
 */

/** Build a simple SELECT query with optional filters */
export function selectQuery(
  table: string,
  columns = '*',
  filters: Record<string, unknown> = {},
  opts: { limit?: number; offset?: number; orderBy?: string; orderDir?: 'ASC' | 'DESC' } = {},
): { sql: string; bindings: unknown[] } {
  const bindings: unknown[] = [];
  const wheres: string[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined) {
      wheres.push(`${key} IS NULL`);
    } else {
      wheres.push(`${key} = ?`);
      bindings.push(value);
    }
  }

  let sql = `SELECT ${columns} FROM ${table}`;
  if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
  if (opts.orderBy) sql += ` ORDER BY ${opts.orderBy} ${opts.orderDir || 'ASC'}`;
  if (opts.limit) {
    sql += ` LIMIT ?`;
    bindings.push(opts.limit);
  }
  if (opts.offset) {
    sql += ` OFFSET ?`;
    bindings.push(opts.offset);
  }

  return { sql, bindings };
}

/** Build an INSERT query returning the SQL and bindings */
export function insertQuery(
  table: string,
  row: Record<string, unknown>,
): { sql: string; bindings: unknown[] } {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  return { sql, bindings: keys.map((k) => row[k] ?? null) };
}

/** Build an UPSERT (INSERT OR REPLACE) query */
export function upsertQuery(
  table: string,
  row: Record<string, unknown>,
  conflictColumns: string[],
): { sql: string; bindings: unknown[] } {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => '?').join(', ');
  const updateCols = keys
    .filter((k) => !conflictColumns.includes(k))
    .map((k) => `${k} = excluded.${k}`)
    .join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(${conflictColumns.join(', ')}) DO UPDATE SET ${updateCols || 'id = id'}`;
  return { sql, bindings: keys.map((k) => row[k] ?? null) };
}

/** Build a batch INSERT query for multiple rows */
export function batchInsertQueries(
  table: string,
  rows: Record<string, unknown>[],
): Array<{ sql: string; bindings: unknown[] }> {
  return rows.map((row) => insertQuery(table, row));
}

/** Run a D1 query safely, returning { data, error } */
export async function safeQuery<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  bindings: unknown[] = [],
): Promise<{ data: T[] | null; error: string | null; count: number }> {
  try {
    const stmt = db.prepare(sql);
    const result = bindings.length ? await stmt.bind(...bindings).all<T>() : await stmt.all<T>();
    return { data: result.results || [], error: null, count: result.results?.length || 0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: msg, count: 0 };
  }
}

/** Run a D1 exec (INSERT/UPDATE/DELETE) safely */
export async function safeRun(
  db: D1Database,
  sql: string,
  bindings: unknown[] = [],
): Promise<{ success: boolean; error: string | null; changes: number }> {
  try {
    const stmt = db.prepare(sql);
    const result = bindings.length ? await stmt.bind(...bindings).run() : await stmt.run();
    return { success: true, error: null, changes: result.meta?.changes || 0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg, changes: 0 };
  }
}
