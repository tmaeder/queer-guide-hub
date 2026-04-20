import { supabase } from '@/integrations/supabase/client';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;

interface RetryableError {
  message?: string;
  status?: number;
  code?: number | string;
}

/**
 * Check if an error is retryable (network or 5xx server error).
 * 4xx client errors (auth, validation) are NOT retried.
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  const err = error as RetryableError & { name?: string };
  // Never retry user/caller-initiated aborts — that re-fires cancelled requests.
  if (err.name === 'AbortError') return false;

  const message = (err.message || String(error)).toLowerCase();
  if (message.includes('abort')) return false;

  // Network errors
  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('failed to fetch')
  ) {
    return true;
  }

  // HTTP 5xx server errors
  const status = err.status || err.code;
  if (typeof status === 'number' && status >= 500) return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface QueryResult<T> {
  data: T | null;
  error: RetryableError | null;
  count?: number | null;
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
export async function queryWithRetry<T = unknown>(
  queryBuilder: () => PromiseLike<QueryResult<T>>,
  options?: { maxRetries?: number; timeoutMs?: number }
): Promise<QueryResult<T>> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let lastError: unknown = null;

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
        return { data: null, error: lastError as RetryableError, count: null };
      }
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
    await sleep(delay);
  }

  return { data: null, error: lastError as RetryableError, count: null };
}

interface InvokeResult<T> {
  data: T | null;
  error: RetryableError | null;
}

/**
 * Invoke a Supabase edge function with retry logic and timeout.
 *
 * Usage:
 *   const { data, error } = await invokeWithRetry('search', {
 *     body: { query: 'bar', filters: {} }
 *   });
 */
export async function invokeWithRetry<T = unknown>(
  functionName: string,
  invokeOptions?: { body?: Record<string, unknown>; headers?: Record<string, string> },
  retryOptions?: { maxRetries?: number; timeoutMs?: number }
): Promise<InvokeResult<T>> {
  const maxRetries = retryOptions?.maxRetries ?? MAX_RETRIES;
  const timeoutMs = retryOptions?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let lastError: unknown = null;

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
        return { data: null, error: lastError as RetryableError };
      }
    }

    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
    await sleep(delay);
  }

  return { data: null, error: lastError as RetryableError };
}
