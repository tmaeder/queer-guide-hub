/**
 * Function invoker — all calls now go to Cloudflare Workers.
 * Kept for backward compatibility with existing imports.
 */
import { api } from '@/integrations/api/client';

interface InvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
}

export async function invokeFunction<T = unknown>(
  functionName: string,
  options?: InvokeOptions,
): Promise<{ data: T | null; error: Error | null }> {
  const result = await api.functions.invoke(functionName, options);
  return {
    data: result.data as T | null,
    error: result.error ? new Error((result.error as any).message || String(result.error)) : null,
  };
}
