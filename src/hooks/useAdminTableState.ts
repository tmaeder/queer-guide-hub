import { useState, useCallback, useRef, useEffect } from 'react';
import type { AdminTableState } from '@/components/admin/data-table/types';

interface UseAdminTableStateOptions {
  defaultSort?: { column: string; direction: 'asc' | 'desc' } | null;
  defaultPageSize?: number;
  defaultColumnVisibility?: Record<string, boolean>;
  defaultFilters?: Record<string, unknown>;
}

export function useAdminTableState(options: UseAdminTableStateOptions = {}) {
  const { defaultSort = null, defaultPageSize = 25, defaultColumnVisibility = {}, defaultFilters = {} } = options;

  const [state, setState] = useState<AdminTableState>({
    search: '',
    debouncedSearch: '',
    filters: defaultFilters,
    sorting: defaultSort,
    pagination: { page: 1, pageSize: defaultPageSize },
    selectedIds: new Set(),
    columnVisibility: defaultColumnVisibility,
    grouping: [],
  });

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const setSearch = useCallback((value: string) => {
    setState((prev) => ({ ...prev, search: value }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        debouncedSearch: value,
        pagination: { ...prev.pagination, page: 1 },
      }));
    }, 300);
  }, []);

  const setFilter = useCallback((key: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
      pagination: { ...prev.pagination, page: 1 },
      selectedIds: new Set(),
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setState((prev) => ({
      ...prev,
      search: '',
      debouncedSearch: '',
      filters: {},
      pagination: { ...prev.pagination, page: 1 },
      selectedIds: new Set(),
    }));
  }, []);

  const toggleSort = useCallback((column: string) => {
    setState((prev) => {
      const current = prev.sorting;
      let next: AdminTableState['sorting'];
      if (!current || current.column !== column) {
        next = { column, direction: 'asc' };
      } else if (current.direction === 'asc') {
        next = { column, direction: 'desc' };
      } else {
        next = null; // clear sort
      }
      return {
        ...prev,
        sorting: next,
        pagination: { ...prev.pagination, page: 1 },
      };
    });
  }, []);

  const setPage = useCallback((page: number) => {
    setState((prev) => ({
      ...prev,
      pagination: { ...prev.pagination, page },
      selectedIds: new Set(),
    }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setState((prev) => ({
      ...prev,
      pagination: { page: 1, pageSize },
      selectedIds: new Set(),
    }));
  }, []);

  const toggleRow = useCallback((id: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selectedIds: next };
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setState((prev) => ({
      ...prev,
      selectedIds: new Set(ids),
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState((prev) => ({ ...prev, selectedIds: new Set() }));
  }, []);

  const toggleColumnVisibility = useCallback((columnId: string) => {
    setState((prev) => ({
      ...prev,
      columnVisibility: {
        ...prev.columnVisibility,
        [columnId]: !prev.columnVisibility[columnId],
      },
    }));
  }, []);

  const setGrouping = useCallback((grouping: string[]) => {
    setState((prev) => ({ ...prev, grouping }));
  }, []);

  return {
    state,
    setSearch,
    setFilter,
    clearFilters,
    toggleSort,
    setPage,
    setPageSize,
    toggleRow,
    selectAll,
    clearSelection,
    toggleColumnVisibility,
    setGrouping,
  };
}
