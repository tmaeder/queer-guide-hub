import { useQuery } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import type { AdminTableState } from '@/components/admin/data-table/types';

interface UseAdminTableQueryOptions {
  tableName: string;
  select?: string;
  searchColumns?: string[];
  baseFilters?: Record<string, unknown>;
  state: Pick<AdminTableState, 'debouncedSearch' | 'filters' | 'sorting' | 'pagination'>;
  enabled?: boolean;
}

function applyFilters(
  builder: ReturnType<typeof api.from>,
  state: UseAdminTableQueryOptions['state'],
  searchColumns: string[],
  baseFilters: Record<string, unknown>,
) {
  let q = builder;

  // Base filters (always applied)
  for (const [key, value] of Object.entries(baseFilters)) {
    if (value === null) {
      q = q.is(key, null);
    } else {
      q = q.eq(key, value as string);
    }
  }

  // Global search across searchable columns
  if (state.debouncedSearch && searchColumns.length > 0) {
    const term = state.debouncedSearch.replace(/%/g, '');
    const orClauses = searchColumns.map((col) => `${col}.ilike.%${term}%`);
    q = q.or(orClauses.join(','));
  }

  // Entity-specific filters
  for (const [key, value] of Object.entries(state.filters)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      q = q.in(key, value);
    } else if (typeof value === 'boolean') {
      q = q.eq(key, value);
    } else {
      q = q.eq(key, value as string);
    }
  }

  return q;
}

export function useAdminTableQuery<T = Record<string, unknown>>(
  options: UseAdminTableQueryOptions,
) {
  const {
    tableName,
    select = '*',
    searchColumns = [],
    baseFilters = {},
    state,
    enabled = true,
  } = options;

  const queryKey = [
    'admin-table',
    tableName,
    state.debouncedSearch,
    state.filters,
    state.sorting,
    state.pagination,
    baseFilters,
  ];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      // Count query
      const countBuilder = api
        .from(tableName as 'venues')
        .select(select, { count: 'exact', head: true });
      const filtered = applyFilters(countBuilder as any, state, searchColumns, baseFilters);
      const { count, error: countError } = await (filtered as any);
      if (countError) throw countError;

      // Data query
      let dataBuilder = api.from(tableName as 'venues').select(select) as any;
      dataBuilder = applyFilters(dataBuilder, state, searchColumns, baseFilters);

      // Sorting
      if (state.sorting) {
        dataBuilder = dataBuilder.order(state.sorting.column, {
          ascending: state.sorting.direction === 'asc',
        });
      } else {
        dataBuilder = dataBuilder.order('created_at', { ascending: false });
      }

      // Pagination
      const { page, pageSize } = state.pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      dataBuilder = dataBuilder.range(from, to);

      const { data, error } = await dataBuilder;
      if (error) throw error;

      return { data: (data || []) as T[], totalCount: count || 0 };
    },
    enabled,
    staleTime: 30_000,
    placeholderData: (prev: { data: T[]; totalCount: number } | undefined) => prev,
  });

  return {
    data: query.data?.data ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
