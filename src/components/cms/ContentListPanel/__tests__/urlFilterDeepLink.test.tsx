/**
 * @vitest-environment jsdom
 *
 * `?<field>=<value>` deep links: the Cities list's venue count links to
 * `/admin/content/venues?city_id=<uuid>&city_id_label=<name>`
 * (`cmsFilteredListPath`). The panel must turn that into an `eq` filter on a
 * real field, label the chip with the name rather than the uuid, ignore params
 * that name no field, and strip what it consumed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getContentType } from '@/config/contentTypes';

const onEdit = vi.fn();
const setFilters = vi.fn();

vi.mock('@/hooks/useContentViews', () => ({
  useContentViews: () => ({
    loading: false,
    views: [],
    reload: vi.fn(),
    createView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
    setDefaultView: vi.fn(),
  }),
}));

vi.mock('../useContentListController', () => ({
  useContentListController: () => ({
    config: getContentType('venues'),
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
    sorts: [],
    setSorts: vi.fn(),
    view: 'table',
    setView: vi.fn(),
    groupBy: null,
    setGroupBy: vi.fn(),
    dateField: null,
    setDateField: vi.fn(),
    archivedView: 'live',
    setArchivedView: vi.fn(),
    mergedView: 'unmerged',
    setMergedView: vi.fn(),
    filters: [],
    setFilters,
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
    onEdit,
    onCreate: vi.fn(),
  }),
}));

import { ContentListPanel } from '../index';

function LocationProbe({ onLoc }: { onLoc: (s: string) => void }) {
  const loc = useLocation();
  onLoc(loc.search);
  return null;
}

const renderAt = (entry: string, contentTypeId?: string, onLoc: (s: string) => void = () => {}) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <TooltipProvider>
          <LocationProbe onLoc={onLoc} />
          <ContentListPanel contentTypeId={contentTypeId} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('ContentListPanel ?<field>= filter deep link', () => {
  beforeEach(() => setFilters.mockClear());

  it('turns ?city_id= into an eq filter labelled with the city name', async () => {
    renderAt('/admin/content/venues?city_id=c-1&city_id_label=Berlin', 'venues');
    await waitFor(() =>
      expect(setFilters).toHaveBeenCalledWith([
        expect.objectContaining({ field: 'city_id', op: 'eq', value: 'c-1', label: 'Berlin' }),
      ]),
    );
  });

  it('strips the consumed params and keeps the rest', async () => {
    let search = '?';
    renderAt('/admin/content/venues?view=v1&city_id=c-1&city_id_label=Berlin', 'venues', (s) => {
      search = s;
    });
    await waitFor(() => expect(setFilters).toHaveBeenCalled());
    await waitFor(() => expect(search).not.toContain('city_id'));
    expect(search).toContain('view=v1');
  });

  it('ignores a param that names no field of the type', async () => {
    let search = '?';
    renderAt('/admin/content/venues?not_a_field=1', 'venues', (s) => {
      search = s;
    });
    await waitFor(() => expect(search).not.toContain('not_a_field'));
    expect(setFilters).not.toHaveBeenCalled();
  });

  it('does nothing without params', async () => {
    renderAt('/admin/content/venues', 'venues');
    await new Promise((r) => setTimeout(r, 20));
    expect(setFilters).not.toHaveBeenCalled();
  });
});
