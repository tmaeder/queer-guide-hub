/**
 * Smart function invoker.
 *
 * When VITE_WORKERS_URL is set, calls to migrated functions are routed
 * to Cloudflare Workers. Everything else still goes to Supabase Edge
 * Functions. This allows a gradual, zero-downtime migration.
 */
import { supabase } from '@/integrations/supabase/client';
import { invokeWorker, workersEnabled, MIGRATED_FUNCTIONS } from './client';

interface InvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
}

/**
 * Call a serverless function by name. Automatically routes to the
 * Cloudflare Worker when available, otherwise falls back to Supabase.
 */
export async function invokeFunction<T = unknown>(
  functionName: string,
  options?: InvokeOptions,
): Promise<{ data: T | null; error: Error | null }> {
  if (workersEnabled && MIGRATED_FUNCTIONS.has(functionName)) {
    return invokeWorker<T>(functionName, options);
  }

  // Fallback to Supabase Edge Function
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: options?.body,
    headers: options?.headers,
    method: options?.method,
  });

  return {
    data: data as T | null,
    error: error ? new Error(error.message) : null,
  };
}
