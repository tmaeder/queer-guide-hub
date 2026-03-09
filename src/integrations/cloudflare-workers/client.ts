/**
 * Cloudflare Workers client — now delegates to the unified API client.
 * Kept for backward compatibility.
 */

export const workersEnabled = true;

export async function invokeWorker<T = unknown>(
  functionName: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: string;
  },
): Promise<{ data: T | null; error: Error | null }> {
  const { api } = await import('@/integrations/api/client');
  const result = await api.functions.invoke(functionName, options);
  return {
    data: result.data as T | null,
    error: result.error ? new Error((result.error as any).message || String(result.error)) : null,
  };
}

/** All functions are now on Workers — this set is no longer checked */
export const MIGRATED_FUNCTIONS = new Set<string>();
