/**
 * @vitest-environment jsdom
 *
 * `?edit=<id>` is what makes `cmsEditPath` honest: there is no
 * `/admin/content/:type/:id` route, because the record editor is a modal owned
 * by AdminShell. So a URL that opens a record has to be a query param handled
 * here — and it has to work for EVERY registry type, not just personalities,
 * which is where this handling used to live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';

const onEdit = vi.fn();

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

describe('ContentListPanel ?edit= deep link', () => {
  beforeEach(() => onEdit.mockClear());

  it('opens the editor for the id in the param', async () => {
    renderAt('/admin/content/venues?edit=rec-1', 'venues');
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('venues', 'rec-1'));
  });

  it('strips the param so refresh/back does not reopen', async () => {
    let search = '?';
    renderAt('/admin/content/venues?edit=rec-1', 'venues', (s) => {
      search = s;
    });
    await waitFor(() => expect(onEdit).toHaveBeenCalled());
    await waitFor(() => expect(search).not.toContain('edit='));
  });

  it('keeps other params when stripping', async () => {
    let search = '?';
    renderAt('/admin/content/venues?view=v1&edit=rec-1', 'venues', (s) => {
      search = s;
    });
    await waitFor(() => expect(onEdit).toHaveBeenCalled());
    await waitFor(() => expect(search).toContain('view=v1'));
    expect(search).not.toContain('edit=');
  });

  it('does nothing without the param', async () => {
    renderAt('/admin/content/venues', 'venues');
    await waitFor(() => expect(onEdit).not.toHaveBeenCalled());
  });

  it('does nothing on the All-content list, where there is no type to open against', async () => {
    // `?edit=` with no resolved type would be a bare id with nothing to open.
    renderAt('/admin/content?edit=rec-1', undefined);
    await waitFor(() => expect(onEdit).not.toHaveBeenCalled());
  });
});
