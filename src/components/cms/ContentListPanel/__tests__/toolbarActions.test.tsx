/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
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
import type { ContentTypeConfig } from '@/types/cms';

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

function renderPanel(config: ContentTypeConfig | null) {
  controller.config = config;
  render(
    <MemoryRouter>
      <TooltipProvider>
        <ContentListPanel contentTypeId="redirects" />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('ContentListPanel toolbarActions', () => {
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
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('keeps the standard New button alongside them', () => {
    renderPanel(
      baseConfig({
        toolbarActions: () => <button type="button">Import</button>,
      }),
    );
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
});
