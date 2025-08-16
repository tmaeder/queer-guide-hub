import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface InfiniteQueryOptions<T> {
  queryKey: string[];
  table: string;
  select?: string;
  filters?: Record<string, any>;
  orderBy?: { column: string; ascending?: boolean };
  pageSize?: number;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export function useInfiniteData<T = any>({
  queryKey,
  table,
  select = '*',
  filters = {},
  orderBy = { column: 'created_at', ascending: false },
  pageSize = 20,
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes
  gcTime = 10 * 60 * 1000, // 10 minutes
}: InfiniteQueryOptions<T>) {
  
  const fetchPage = async ({ pageParam = 0 }): Promise<{ data: T[]; nextPage: number | null }> => {
    let query = supabase
      .from(table)
      .select(select)
      .order(orderBy.column, { ascending: orderBy.ascending })
      .range(pageParam * pageSize, (pageParam + 1) * pageSize - 1);

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === 'string' && value.includes('%')) {
          query = query.ilike(key, value);
        } else {
          query = query.eq(key, value);
        }
      }
    });

    const { data, error, count } = await query;

    if (error) throw error;

    const nextPage = data && data.length === pageSize ? pageParam + 1 : null;
    
    return {
      data: data || [],
      nextPage,
    };
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: fetchPage,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Flatten the pages into a single array
  const flatData = data?.pages.flatMap(page => page.data) || [];

  return {
    data: flatData,
    error: error?.message || null,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    refetch,
    totalCount: flatData.length,
  };
}