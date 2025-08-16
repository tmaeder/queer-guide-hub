// Performance utilities for React Query optimizations

import { QueryClient } from '@tanstack/react-query';

// Batch query operations to reduce re-renders
export const batchQueryUpdates = (queryClient: QueryClient, updates: (() => void)[]) => {
  // Execute updates synchronously to batch them
  updates.forEach(update => update());
};

// Selective query invalidation
export const invalidateQueriesSelectively = (
  queryClient: QueryClient, 
  patterns: string[][]
) => {
  patterns.forEach(pattern => {
    queryClient.invalidateQueries({ 
      queryKey: pattern,
      exact: false 
    });
  });
};

// Prefetch related data
export const prefetchRelatedQueries = async (
  queryClient: QueryClient,
  prefetches: Array<{
    queryKey: string[];
    queryFn: () => Promise<any>;
    staleTime?: number;
  }>
) => {
  const promises = prefetches.map(({ queryKey, queryFn, staleTime = 5 * 60 * 1000 }) =>
    queryClient.prefetchQuery({
      queryKey,
      queryFn,
      staleTime,
    })
  );
  
  return Promise.allSettled(promises);
};

// Memory-efficient data transformation
export const transformDataEfficiently = <T, R>(
  data: T[],
  transformer: (item: T) => R,
  batchSize = 100
): R[] => {
  const result: R[] = [];
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const transformedBatch = batch.map(transformer);
    result.push(...transformedBatch);
    
    // Allow other tasks to run
    if (i + batchSize < data.length) {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(result.concat(
            transformDataEfficiently(
              data.slice(i + batchSize),
              transformer,
              batchSize
            )
          ));
        }, 0);
      }) as any;
    }
  }
  
  return result;
};

// Optimize image loading
export const optimizeImageLoading = (src: string, quality = 80, format = 'webp') => {
  // If using a CDN like Cloudinary or similar, optimize the URL
  if (src.includes('cloudinary.com')) {
    return src.replace('/upload/', `/upload/q_${quality},f_${format}/`);
  }
  
  // Add lazy loading and optimization hints
  return {
    src,
    loading: 'lazy' as const,
    decoding: 'async' as const,
  };
};

// Debounced search optimization
export const createDebouncedSearch = (
  searchFn: (query: string) => void,
  delay = 300
) => {
  let timeoutId: NodeJS.Timeout;
  
  return (query: string) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => searchFn(query), delay);
  };
};