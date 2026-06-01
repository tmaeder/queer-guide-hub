import { QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

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
        retry: (failureCount, error: Error & { status?: number }) => {
          // Don't retry on authentication errors
          if (error?.status === 401 || error?.status === 403) {
            return false;
          }
          // Don't retry on client errors except timeout
          if (error?.status >= 400 && error?.status < 500 && error?.status !== 408) {
            return false;
          }
          // Retry network errors and server errors up to 3 times
          return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
        // Network mode for better offline handling
        networkMode: 'online',
      },
      mutations: {
        // Retry mutations with better error handling
        retry: (failureCount, error: Error & { status?: number }) => {
          // Don't retry client errors
          if (error?.status >= 400 && error?.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
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
