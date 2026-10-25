import { QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

type RequestError = Error & { status?: number; code?: string };

/**
 * True when retrying cannot help: an HTTP 4xx (except 408), or a Supabase
 * PostgrestError — which carries a `code`, not a `status` — for a request,
 * auth, permission or data error. Connection-class codes (PGRST000-003) and
 * server faults (e.g. 57014 statement timeout) stay retryable.
 */
export const isNonRetryableError = (error: RequestError | null | undefined): boolean => {
  const status = error?.status;
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408) return true;
  const code = error?.code;
  if (typeof code !== 'string') return false;
  // PGRST1xx request, PGRST2xx schema/relation, PGRST3xx JWT; SQLSTATE
  // 22 data, 23 constraint, 28 auth, 42 syntax/permission, P0001 raise.
  return (
    /^PGRST[123]\d\d$/.test(code) || /^(22|23|28|42)[0-9A-Z]{3}$/.test(code) || code === 'P0001'
  );
};

// Optimized query client configuration with better batching and error handling
export const createOptimizedQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache for 5 minutes by default
        staleTime: 5 * 60 * 1000,
        // Keep in memory for 15 minutes
        gcTime: 15 * 60 * 1000,
        // Don't refetch on window focus in production
        refetchOnWindowFocus: process.env.NODE_ENV === 'development',
        // Only refetch on mount if data is actually stale (default behavior).
        // 'always' forced every mount to refetch regardless of staleTime,
        // making the 5min cache effectively a no-op for components remounting
        // on route changes — see audit P2 on TanStack staleTime defaults.
        refetchOnMount: true,
        // Refetch when network reconnects after offline
        refetchOnReconnect: true,
        // Aggressive retry strategy with better error handling
        // Retry network and server errors up to 3 times; never client errors.
        retry: (failureCount, error: RequestError) =>
          !isNonRetryableError(error) && failureCount < 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
        // Network mode for better offline handling
        networkMode: 'online',
      },
      mutations: {
        // Retry mutations with better error handling
        retry: (failureCount, error: RequestError) =>
          !isNonRetryableError(error) && failureCount < 2,
        retryDelay: 1500,
        networkMode: 'online',
        onError: (error) => Sentry.captureException(error),
      },
    },
  });
};

// Query key factories for consistent caching
export const queryKeys = {
  countries: (filters?: Record<string, unknown>) => ['countries', filters],
  cities: (filters?: Record<string, unknown>) => ['cities', filters],
  venues: (filters?: Record<string, unknown>) => ['venues', filters],
  events: (filters?: Record<string, unknown>) => ['events', filters],
  profiles: (userId?: string) => ['profiles', userId],
  groups: (filters?: Record<string, unknown>) => ['groups', filters],
  posts: (filters?: Record<string, unknown>) => ['posts', filters],
  notifications: (userId?: string) => ['notifications', userId],
  messages: (conversationId?: string) => ['messages', conversationId],
  conversations: (userId?: string) => ['conversations', userId],
  favorites: (userId?: string, type?: string) => ['favorites', userId, type],
} as const;

// NB: `prefetchQueries` + `invalidationPatterns` were removed here — both were
// unused (0 references), and `prefetchQueries` fetched non-existent same-origin
// endpoints (`/api/venues`, `/api/profiles/:id`). With the `/*` → index.html
// catch-all those would have resolved to HTML with a 200, so `.then(r=>r.json())`
// would throw — a footgun for anyone who wired them up. Reintroduce as real
// Pages Functions / Supabase queries if prefetching is needed.
