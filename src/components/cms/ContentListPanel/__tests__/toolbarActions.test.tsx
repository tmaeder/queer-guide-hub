/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
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
import { Tag } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import type { Filter } from '../viewSpec';
import { unifiedTagsContentType } from '@/config/contentTypes/tag';

/**
 * `toolbarActions` is what lets a page like AdminRedirects — which carries a
 * bulk-import dialog beside the standard export — move onto the registry
 * without losing that button.
 *
 * It is a render FUNCTION, not a node, so the config object stays static:
 * anything needing React state owns it inside the returned component.
 */

const controller = {
  config: null as ContentTypeConfig | null,
  contentTypeId: 'redirects',
  items: [],
  loading: false,
  totalCount: 0,
  search: '',
  debouncedSearch: '',
  archivedView: 'live',
  mergedView: 'unmerged',
  setSearch: vi.fn(),
  sorts: [{ field: 'title', dir: 'asc' }],
  setSorts: vi.fn(),
  sortField: 'title',
  sortDir: 'desc',
  handleSort: vi.fn(),
  filters: [] as Filter[],
  setFilters: vi.fn(),
  filterFields: [],
  setFilter: vi.fn(),
  clearFilters: vi.fn(),
  dynamicOptions: {},
  columns: [],
  spec: { kind: 'table', columns: [], filters: [], sorts: [], groupBy: null, dateField: null },
  applySpec: vi.fn(),
  setColumns: vi.fn(),

  allListColumns: [] as FieldConfig[],
  extraColumns: [],
  selected: new Set<string>(),
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
};

vi.mock('../useContentListController', () => ({
  useContentListController: () => controller,
}));

vi.mock('../exportContentList', () => ({
  exportContentType: vi.fn().mockResolvedValue(undefined),
}));
import { exportContentType } from '../exportContentList';

const { ContentListPanel } = await import('../index');

function baseConfig(over: Partial<ContentTypeConfig> = {}): ContentTypeConfig {
  return {
    id: 'redirects',
    tableName: 'redirects',
    primaryKey: 'id',
    titleField: 'source_path',
    icon: Tag,
    label: { singular: 'Redirect', plural: 'Redirects' },
    color: 'hsl(0 0% 20%)',
    fields: [],
    ...over,
  } as ContentTypeConfig;
}

function renderPanel(
  config: ContentTypeConfig | null,
  props: Partial<React.ComponentProps<typeof ContentListPanel>> = {},
) {
  controller.config = config;
  render(
    <MemoryRouter>
      <TooltipProvider>
        <ContentListPanel contentTypeId="redirects" {...props} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('ContentListPanel toolbarActions', () => {
  it('keeps creation visible and reveals refresh through supporting tools', () => {
    renderPanel(baseConfig());
    expect(screen.getByRole('button', { name: /New Redirect/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(controller.loadItems).toHaveBeenCalled();
  });
  it.each(['Excel', 'CSV'] as const)(
    'exports all tags as %s despite search, filters, and pagination',
    async (format) => {
      const config = unifiedTagsContentType;
      const original = {
        filters: controller.filters,
        search: controller.search,
        debouncedSearch: controller.debouncedSearch,
        page: controller.page,
        allListColumns: controller.allListColumns,
      };
      controller.filters = [{ id: 'status-filter', field: 'status', op: 'eq', value: 'active' }];
      controller.search = 'filtered';
      controller.debouncedSearch = 'filtered';
      controller.page = 3;
      controller.allListColumns = config.fields.filter((field) => field.listColumn);
      expect(controller.allListColumns).toEqual([]);
      try {
        renderPanel(config);
        fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
        expect(screen.getByRole('button', { name: 'Export Excel' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: `Export ${format}` }));
        await waitFor(() =>
          expect(exportContentType).toHaveBeenCalledWith(config, controller.allListColumns, format),
        );
        expect(vi.mocked(exportContentType).mock.lastCall).toHaveLength(3);
        await waitFor(() =>
          expect(screen.getByRole('button', { name: `Export ${format}` })).not.toBeDisabled(),
        );
      } finally {
        Object.assign(controller, original);
      }
    },
  );

  it('offers Excel and CSV for every content type, not only tags', () => {
    renderPanel(baseConfig());
    fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  });

  it.each([false, true])(
    'keeps exports available with a hidden header (workspace=%s)',
    (workspace) => {
      renderPanel(baseConfig(), { hideHeader: true, workspace });
      fireEvent.click(
        screen.getByRole('button', { name: workspace ? 'List tools' : 'Content tools' }),
      );
      expect(screen.getByRole('button', { name: 'Export Excel' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    },
  );

  it('renders nothing extra when a type declares none', () => {
    renderPanel(baseConfig());
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
    // The standard New button is unaffected.
    expect(screen.getByRole('button', { name: /New Redirect/i })).toBeInTheDocument();
  });

  it('renders declared toolbar actions', () => {
    renderPanel(
      baseConfig({
        toolbarActions: () => <button type="button">Import</button>,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('keeps the standard New button alongside them', () => {
    renderPanel(
      baseConfig({
        toolbarActions: () => <button type="button">Import</button>,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Redirect/i })).toBeInTheDocument();
  });

  it('calls the render function rather than treating it as a node', () => {
    // A static node in a module-level config would be constructed once at import
    // and could never hold state; the function form is what makes a dialog work.
    const toolbarActions = vi.fn(() => <button type="button">Import</button>);
    renderPanel(baseConfig({ toolbarActions }));
    expect(toolbarActions).toHaveBeenCalled();
  });

  it('groups workspace controls and exposes applied filters as removable chips', () => {
    controller.filters = [{ id: 'status-filter', field: 'status', op: 'eq', value: 'active' }];
    renderPanel(
      baseConfig({
        fields: [{ name: 'status', label: 'Status', type: 'text', group: 'basic' }],
      }),
    );

    expect(screen.getByRole('region', { name: 'Content workspace controls' })).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: 'Remove filter: Status is active' });
    fireEvent.click(chip);
    expect(controller.setFilters).toHaveBeenCalledWith([]);

    controller.filters = [];
  });
});
