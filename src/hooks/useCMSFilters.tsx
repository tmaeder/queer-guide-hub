import { useState, useMemo } from 'react';

export interface CMSFilters {
  search: string;
  contentType: string;
  status: string;
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  showDeleted: boolean;
  page: number;
  pageSize: number;
}

export interface UseCMSFiltersProps {
  data: any[];
}

export function useCMSFilters({ data }: UseCMSFiltersProps) {
  const [filters, setFilters] = useState<CMSFilters>({
    search: '',
    contentType: 'all',
    status: 'all',
    dateRange: {
      from: null,
      to: null
    },
    sortBy: 'updated_at',
    sortOrder: 'desc',
    showDeleted: false,
    page: 1,
    pageSize: 10
  });

  const updateFilter = (key: keyof CMSFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      // Reset to first page when filters change (except for page changes)
      ...(key !== 'page' && key !== 'pageSize' ? { page: 1 } : {})
    }));
  };

  const updateSort = (column: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1
    }));
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      contentType: 'all',
      status: 'all',
      dateRange: {
        from: null,
        to: null
      },
      sortBy: 'updated_at',
      sortOrder: 'desc',
      showDeleted: false,
      page: 1,
      pageSize: 10
    });
  };

  const filteredAndSortedData = useMemo(() => {
    let result = [...data];

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(item => 
        item.title?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.content_type?.toLowerCase().includes(searchLower)
      );
    }

    // Apply content type filter
    if (filters.contentType !== 'all') {
      result = result.filter(item => item.content_type === filters.contentType);
    }

    // Apply status filter
    if (filters.status !== 'all') {
      result = result.filter(item => {
        const status = item.status || item.workflow_state || 'unknown';
        return status === filters.status;
      });
    }

    // Apply date range filter
    if (filters.dateRange.from || filters.dateRange.to) {
      result = result.filter(item => {
        const itemDate = new Date(item.updated_at);
        const fromMatch = !filters.dateRange.from || itemDate >= filters.dateRange.from;
        const toMatch = !filters.dateRange.to || itemDate <= filters.dateRange.to;
        return fromMatch && toMatch;
      });
    }

    // Apply deleted filter
    if (!filters.showDeleted) {
      result = result.filter(item => !item.deleted_at);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aValue = a[filters.sortBy];
      let bValue = b[filters.sortBy];

      // Handle different data types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return filters.sortOrder === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return filters.sortOrder === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return result;
  }, [data, filters]);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (filters.page - 1) * filters.pageSize;
    const endIndex = startIndex + filters.pageSize;
    return filteredAndSortedData.slice(startIndex, endIndex);
  }, [filteredAndSortedData, filters.page, filters.pageSize]);

  const totalPages = Math.ceil(filteredAndSortedData.length / filters.pageSize);

  // Get unique values for filter options
  const filterOptions = useMemo(() => {
    const contentTypes = [...new Set(data.map(item => item.content_type))].sort();
    const statuses = [...new Set(data.map(item => item.status || item.workflow_state || 'unknown'))].sort();
    
    return {
      contentTypes,
      statuses
    };
  }, [data]);

  return {
    filters,
    updateFilter,
    updateSort,
    resetFilters,
    filteredData: paginatedData,
    allFilteredData: filteredAndSortedData,
    filterOptions,
    totalResults: filteredAndSortedData.length,
    totalRecords: data.length,
    totalPages,
    currentPage: filters.page,
    pageSize: filters.pageSize
  };
}