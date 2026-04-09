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
        // Refetch stale queries when component mounts (e.g., route navigation)
        refetchOnMount: 'always',
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

// Background prefetching helpers
export const prefetchQueries = {
  prefetchRelatedVenues: async (queryClient: QueryClient, cityId: string) => {
    return queryClient.prefetchQuery({
      queryKey: queryKeys.venues({ city: cityId }),
      queryFn: () => fetch(`/api/venues?city=${cityId}`).then(res => res.json()),
      staleTime: 10 * 60 * 1000, // 10 minutes
    });
  },
  
  prefetchUserProfile: async (queryClient: QueryClient, userId: string) => {
    return queryClient.prefetchQuery({
      queryKey: queryKeys.profiles(userId),
      queryFn: () => fetch(`/api/profiles/${userId}`).then(res => res.json()),
      staleTime: 30 * 60 * 1000, // 30 minutes
    });
  },
};

// Cache invalidation patterns
export const invalidationPatterns = {
  invalidateVenueRelated: (queryClient: QueryClient, venueId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['venues'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    if (venueId) {
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] });
    }
  },
  
  invalidateUserRelated: (queryClient: QueryClient, userId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['favorites'] });
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['profiles', userId] });
    }
  },
};
