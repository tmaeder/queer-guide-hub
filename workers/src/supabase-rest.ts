/**
 * Lightweight Supabase REST helper for Workers.
 * Allows Workers to query Supabase tables and RPCs without the full SDK.
 */
import type { Env } from './types';

interface RestOptions {
  /** HTTP method (GET, POST, PATCH, DELETE). Defaults to GET. */
  method?: string;
  /** Additional query parameters appended to the URL. */
  params?: URLSearchParams | Record<string, string>;
  /** JSON body for POST/PATCH. */
  body?: unknown;
  /** Extra headers (e.g. Prefer). */
  headers?: Record<string, string>;
}

/**
 * Execute a Supabase REST API query.
 * @param env Worker environment with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * @param path REST path, e.g. `/rest/v1/airports?iata_code=eq.JFK` or `/rest/v1/rpc/find_nearest_airport`
 */
export async function supabaseRest<T = unknown>(
  env: Env,
  path: string,
  options?: RestOptions,
): Promise<{ data: T | null; error: string | null }> {
  const method = options?.method ?? 'GET';
  let url = `${env.SUPABASE_URL}${path}`;

  if (options?.params) {
    const qs = options.params instanceof URLSearchParams
      ? options.params
      : new URLSearchParams(options.params);
    const sep = url.includes('?') ? '&' : '?';
    url += sep + qs.toString();
  }

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { data: null, error: `Supabase REST ${resp.status}: ${text}` };
    }

    const data = (await resp.json()) as T;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

/**
 * Call a Supabase RPC function.
 */
export async function supabaseRpc<T = unknown>(
  env: Env,
  functionName: string,
  params: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  return supabaseRest<T>(env, `/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    body: params,
  });
}

/**
 * Verify a JWT and return the user object, or null.
 */
export async function getUser(
  env: Env,
  token: string,
): Promise<{ id: string; email?: string } | null> {
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as { id?: string; email?: string };
    return user?.id ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}
