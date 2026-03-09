/**
 * Supabase REST compatibility layer — queries D1 instead of Supabase REST API.
 * Legacy routes that used supabaseRest/supabaseRpc now hit D1 directly.
 */
import type { Env } from './types';
import { verifyToken } from './lib/jwt';

interface RestOptions {
  method?: string;
  params?: URLSearchParams | Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Query D1 database (replaces Supabase REST API calls).
 * For simple table lookups, pass the table path like `/rest/v1/airports?iata_code=eq.JFK`
 */
export async function supabaseRest<T = unknown>(
  env: Env,
  path: string,
  options?: RestOptions,
): Promise<{ data: T | null; error: string | null }> {
  try {
    // Parse the path to extract table name and filters
    const url = new URL(path, 'https://placeholder');
    const tablePath = url.pathname.replace('/rest/v1/', '');

    if (options?.method === 'POST' && tablePath.startsWith('rpc/')) {
      const funcName = tablePath.replace('rpc/', '');
      return supabaseRpc<T>(env, funcName, options.body as Record<string, unknown>);
    }

    // Build simple SELECT query
    const table = tablePath.replace(/[^a-zA-Z0-9_]/g, '');
    const conditions: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of url.searchParams.entries()) {
      if (key === 'select' || key === 'order' || key === 'limit') continue;
      const match = val.match(/^eq\.(.*)$/);
      if (match) {
        conditions.push(`${key.replace(/[^a-zA-Z0-9_]/g, '')} = ?`);
        values.push(match[1]);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const select = url.searchParams.get('select') || '*';
    const limit = url.searchParams.get('limit') || '100';

    const result = await env.DB.prepare(
      `SELECT ${select} FROM ${table} ${where} LIMIT ?`
    ).bind(...values, parseInt(limit)).all();

    return { data: result.results as T, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

/**
 * Call an RPC-style function against D1.
 */
export async function supabaseRpc<T = unknown>(
  env: Env,
  functionName: string,
  params: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  // Handle known RPC functions by mapping to D1 queries
  try {
    switch (functionName) {
      case 'find_nearest_airport': {
        const { lat, lng } = params;
        const result = await env.DB.prepare(
          `SELECT *, (
            (latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)
          ) AS dist
          FROM airports
          ORDER BY dist
          LIMIT 1`
        ).bind(lat, lat, lng, lng).first();
        return { data: result as T, error: null };
      }
      default:
        return { data: null, error: `RPC '${functionName}' not implemented` };
    }
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

/**
 * Verify a JWT and return the user, or null.
 */
export async function getUser(
  env: Env,
  token: string,
): Promise<{ id: string; email?: string } | null> {
  try {
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload) return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
