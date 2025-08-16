import { QueryClient } from '@tanstack/react-query';

// Optimized query client configuration
export const createOptimizedQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache for 5 minutes by default
        staleTime: 5 * 60 * 1000,
        // Keep in memory for 10 minutes
        gcTime: 10 * 60 * 1000,
        // Don't refetch on window focus in production
        refetchOnWindowFocus: process.env.NODE_ENV === 'development',
        // Retry failed requests with exponential backoff
        retry: (failureCount, error: any) => {
          // Don't retry on 4xx errors
          if (error?.status >= 400 && error?.status < 500) {
            return false;
          }
          // Retry up to 3 times for other errors
          return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        // Retry mutations once
        retry: 1,
        retryDelay: 1000,
      },
    },
  });
};

// Query key factories for consistent caching
export const queryKeys = {
  countries: (filters?: any) => ['countries', filters],
  cities: (filters?: any) => ['cities', filters],
  venues: (filters?: any) => ['venues', filters],
  events: (filters?: any) => ['events', filters],
  profiles: (userId?: string) => ['profiles', userId],
  groups: (filters?: any) => ['groups', filters],
  posts: (filters?: any) => ['posts', filters],
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
