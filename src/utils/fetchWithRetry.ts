import { supabase } from '@/integrations/supabase/client';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Check if an error is retryable (network or 5xx server error).
 * 4xx client errors (auth, validation) are NOT retried.
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;

  const message = (error.message || error.toString()).toLowerCase();

  // Network errors
  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('aborted') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('failed to fetch')
  ) {
    return true;
  }

  // HTTP 5xx server errors
  const status = error.status || error.code;
  if (typeof status === 'number' && status >= 500) return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a Supabase query with retry logic and timeout.
 *
 * Usage:
 *   const { data, error, count } = await queryWithRetry(() =>
 *     supabase.from('events').select('*', { count: 'exact' }).order('created_at', { ascending: false })
 *   );
 *
 * The `queryBuilder` function is called fresh on each attempt (important: don't
 * build the query outside and pass it, since Supabase query builders are
 * single-use once `.then()` / `await` is called).
 */
export async function queryWithRetry<T = any>(
  queryBuilder: () => PromiseLike<{ data: T | null; error: any; count?: number | null }>,
  options?: { maxRetries?: number; timeoutMs?: number }
): Promise<{ data: T | null; error: any; count?: number | null }> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Race between the query and a timeout
      const result = await Promise.race([
        queryBuilder(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
        ),
      ]);

      // If Supabase returned an error object but didn't throw
      if (result.error) {
        if (!isRetryableError(result.error) || attempt === maxRetries - 1) {
          return result;
        }
        lastError = result.error;
      } else {
        return result;
      }
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxRetries - 1) {
        return { data: null, error: lastError, count: null };
      }
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
    await sleep(delay);
  }

  return { data: null, error: lastError, count: null };
}

/**
 * Invoke a Supabase edge function with retry logic and timeout.
 *
 * Usage:
 *   const { data, error } = await invokeWithRetry('search', {
 *     body: { query: 'bar', filters: {} }
 *   });
 */
export async function invokeWithRetry<T = any>(
  functionName: string,
  invokeOptions?: { body?: any; headers?: Record<string, string> },
  retryOptions?: { maxRetries?: number; timeoutMs?: number }
): Promise<{ data: T | null; error: any }> {
  const maxRetries = retryOptions?.maxRetries ?? MAX_RETRIES;
  const timeoutMs = retryOptions?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        supabase.functions.invoke(functionName, invokeOptions),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
        ),
      ]);

      if (result.error) {
        if (!isRetryableError(result.error) || attempt === maxRetries - 1) {
          return { data: result.data as T | null, error: result.error };
        }
        lastError = result.error;
      } else {
        return { data: result.data as T | null, error: null };
      }
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxRetries - 1) {
        return { data: null, error: lastError };
      }
    }

    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
    await sleep(delay);
  }

  return { data: null, error: lastError };
}
