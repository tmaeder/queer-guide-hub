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
    showDeleted: false
  });

  const updateFilter = (key: keyof CMSFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
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
      showDeleted: false
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
    resetFilters,
    filteredData: filteredAndSortedData,
    filterOptions,
    totalResults: filteredAndSortedData.length,
    totalRecords: data.length
  };
}