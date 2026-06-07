/**
 * useAbortableQuery — thin wrapper over React Query's useQuery that threads the
 * request's AbortSignal into the query function.
 *
 * Admin manager components historically fetched with raw useState/useEffect +
 * the helpers in usePageFetchers.ts, which gives no retry, no abort, no cache,
 * and setState-after-unmount warnings. Migrating those reads to this hook gives
 * all four for free: retry/backoff from `createOptimizedQueryClient`, automatic
 * cancellation on unmount or key change (pass the `signal` to
 * `.abortSignal(signal)` on the supabase builder), and React-Query-managed
 * lifecycle so no state is written after unmount.
 *
 * Usage:
 *   const { data, isLoading, error } = useAbortableQuery(
 *     ['news-sources'],
 *     (signal) => supabase.from('news_sources').select('*').abortSignal(signal),
 *   );
 */
import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

export function useAbortableQuery<T>(
  queryKey: unknown[],
  queryFn: (signal: AbortSignal) => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, unknown[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<T, Error> {
  return useQuery<T, Error, T, unknown[]>({
    queryKey,
    queryFn: ({ signal }) => queryFn(signal),
    ...options,
  });
}
