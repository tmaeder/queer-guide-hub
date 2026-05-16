/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('../useContentListController', () => ({
  useContentListController: () => ({
    config: null, contentTypeId: 'venues',
    items: [], loading: false, totalCount: 0,
    search: '', debouncedSearch: '', setSearch: vi.fn(),
    sortField: null, sortDir: 'desc', handleSort: vi.fn(),
    filters: {}, filterFields: [], setFilter: vi.fn(), clearFilters: vi.fn(),
    dynamicOptions: {},
    hiddenColumns: [], setHiddenColumns: vi.fn(), allListColumns: [], extraColumns: [],
    selected: new Set(), setSelected: vi.fn(),
    allSelected: false, someSelected: false, toggleSelect: vi.fn(), toggleSelectAll: vi.fn(),
    page: 1, rowsPerPage: 25, setPage: vi.fn(), setRowsPerPage: vi.fn(),
    loadItems: vi.fn(), onEdit: vi.fn(), onCreate: vi.fn(),
  }),
}));

import { ContentListPanel } from '../index';

describe('ContentListPanel', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><TooltipProvider><ContentListPanel contentTypeId="venues" /></TooltipProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
