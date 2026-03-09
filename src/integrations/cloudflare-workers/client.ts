/**
 * Cloudflare Workers client.
 *
 * Functions migrated from Supabase Edge Functions to Cloudflare Workers
 * use this client instead of `supabase.functions.invoke()`.
 *
 * Set VITE_WORKERS_URL in your .env to the Workers deployment URL.
 * Falls back to Supabase Edge Functions when VITE_WORKERS_URL is not set,
 * so the migration is gradual and non-breaking.
 */

const WORKERS_BASE_URL = import.meta.env.VITE_WORKERS_URL || '';

/**
 * Whether Workers are enabled (VITE_WORKERS_URL is set).
 */
export const workersEnabled = !!WORKERS_BASE_URL;

/**
 * Invoke a Cloudflare Worker function.
 *
 * The API mirrors `supabase.functions.invoke()` so call-sites require
 * minimal changes.
 */
export async function invokeWorker<T = unknown>(
  functionName: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: string;
  },
): Promise<{ data: T | null; error: Error | null }> {
  const url = `${WORKERS_BASE_URL}/${functionName}`;
  const method = options?.method || (options?.body ? 'POST' : 'GET');

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const data = (await resp.json()) as T;

    if (!resp.ok) {
      const errMsg = (data as any)?.error || `Worker returned ${resp.status}`;
      return { data: null, error: new Error(errMsg) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * List of function names that have been migrated to Workers.
 * Used by the smart invoker to decide whether to call Workers or Supabase.
 */
export const MIGRATED_FUNCTIONS = new Set([
  'cloudflare-api',
  'get-turnstile-config',
  'verify-turnstile',
  'redis-get',
  'redis-set',
  'redis-delete',
  'redis-keys',
  'get-weather-forecast',
  'travel-deals',
  'mapbox-geocoding',
  'get-pexels-images',
  'redirect-handler',
]);
