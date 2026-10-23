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
import {
  brandListConfig,
  hotelListConfig,
  merchantListConfig,
  partnerListConfig,
} from '@/components/admin/business/organisationListConfigs';
import { getContentType } from '@/config/contentTypes';
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
  props: { workspace?: boolean; hideHeader?: boolean } = {},
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
  it('offers CSV alongside Excel for tags even with search, filters, and pagination active', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
      await waitFor(() =>
        // Every page, but only the rows the list currently matches.
        expect(exportContentType).toHaveBeenCalledWith(config, controller.allListColumns, 'CSV', {
          filters: controller.filters,
          search: 'filtered',
          archivedView: undefined,
          mergedView: undefined,
        }),
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Export CSV' })).not.toBeDisabled(),
      );
    } finally {
      Object.assign(controller, original);
    }
  });

  it('offers Excel and CSV for every content type, not only tags', () => {
    renderPanel(baseConfig());
    fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  });

  it('offers Excel and CSV in the workspace header too (Organisations)', () => {
    // /admin/content/organizations renders the list with `workspace hideHeader`,
    // whose "List tools" menu is a different header; it carried no exports.
    renderPanel(baseConfig(), { workspace: true, hideHeader: true });
    expect(screen.queryByRole('button', { name: 'Content tools' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'List tools' }));
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exportContentType).toHaveBeenCalledWith(
      expect.objectContaining({ id: baseConfig().id }),
      controller.allListColumns,
      'CSV',
      expect.objectContaining({ filters: controller.filters }),
    );
  });

  it.each([
    ['Brands', brandListConfig],
    ['Hotels', hotelListConfig],
    ['Merchants', merchantListConfig],
    ['Partners', partnerListConfig],
  ])('the Organisations %s tab gets Excel and CSV from the workspace header', (_tab, config) => {
    renderPanel(config, { workspace: true, hideHeader: true });
    fireEvent.click(screen.getByRole('button', { name: 'List tools' }));
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exportContentType).toHaveBeenLastCalledWith(
      config,
      controller.allListColumns,
      'CSV',
      expect.any(Object),
    );
  });

  it('keeps Excel and CSV when a page hides the header to own its title (Milestones)', () => {
    renderPanel(baseConfig(), { hideHeader: true });
    expect(screen.queryByRole('button', { name: 'List tools' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  });

  it.each(['personalities', 'milestones', 'events', 'cities'])(
    'the real %s config offers Excel and CSV',
    (id) => {
      renderPanel(getContentType(id)!);
      fireEvent.click(screen.getByRole('button', { name: 'Content tools' }));
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
      expect(exportContentType).toHaveBeenLastCalledWith(
        getContentType(id),
        controller.allListColumns,
        'CSV',
        expect.any(Object),
      );
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
