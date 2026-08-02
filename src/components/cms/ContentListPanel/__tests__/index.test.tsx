/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ContentListPanel now loads saved views through TanStack Query.
const render = (ui: React.ReactElement) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('../useContentListController', () => ({
  useContentListController: () => ({
    config: null,
    contentTypeId: 'venues',
    items: [],
    loading: false,
    totalCount: 0,
    search: '',
    debouncedSearch: '',
    setSearch: vi.fn(),
    sortField: null,
    sortDir: 'desc',
    handleSort: vi.fn(),
    filters: [],
    setFilters: vi.fn(),
    filterFields: [],
    setFilter: vi.fn(),
    clearFilters: vi.fn(),
    dynamicOptions: {},
    columns: [],
    spec: { kind: 'table', columns: [], filters: [], sorts: [], groupBy: null, dateField: null },
    applySpec: vi.fn(),
    setColumns: vi.fn(),

    allListColumns: [],
    extraColumns: [],
    selected: new Set(),
    setSelected: vi.fn(),
    allSelected: false,
    someSelected: false,
    toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(),
    page: 1,
    rowsPerPage: 25,
    setPage: vi.fn(),
    setRowsPerPage: vi.fn(),
    loadItems: vi.fn(),
    onEdit: vi.fn(),
    onCreate: vi.fn(),
  }),
}));

import { ContentListPanel } from '../index';

describe('ContentListPanel', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter>
        <TooltipProvider>
          <ContentListPanel contentTypeId="venues" />
        </TooltipProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
