/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAdminTableQuery', () => ({
  useAdminTableQuery: () => ({ data: [], totalCount: 0, isLoading: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useAdminTableState', () => ({
  useAdminTableState: () => ({
    state: {
      debouncedSearch: '', filters: {}, sorting: null,
      pagination: { page: 1, pageSize: 25 },
      columnVisibility: {}, grouping: [], selectedIds: new Set(), search: '',
    },
    setSearch: vi.fn(), setFilter: vi.fn(), clearFilters: vi.fn(), toggleSort: vi.fn(),
    setPage: vi.fn(), setPageSize: vi.fn(), toggleRow: vi.fn(), selectAll: vi.fn(),
    clearSelection: vi.fn(), toggleColumnVisibility: vi.fn(), setGrouping: vi.fn(),
  }),
}));
vi.mock('@/hooks/useFilterPresets', () => ({
  useFilterPresets: () => ({ presets: [], save: vi.fn(), remove: vi.fn(), get: vi.fn() }),
}));

import { AdminDataTable } from '../AdminDataTable';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminDataTable', () => {
  it('renders without crashing', () => {
    const config = {
      tableName: 'venues',
      select: '*',
      columns: [{ accessorKey: 'id', header: 'ID' }],
      defaultSort: { column: 'id', direction: 'asc' as const },
    } as never;
    const { container } = render(<AdminDataTable config={config} />, { wrapper });
    expect(container).toBeTruthy();
  });
});
