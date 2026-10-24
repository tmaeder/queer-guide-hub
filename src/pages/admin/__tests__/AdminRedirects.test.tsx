import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AdminRedirects from '../AdminRedirects';
import { manualRedirect, type InventoryRedirect } from '@/lib/redirects/inventory';

vi.mock('@/utils/excelExport', () => ({ exportToExcel: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));
import { exportToExcel } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';

const mocks = vi.hoisted(() => ({
  openEditor: vi.fn(),
  refetch: vi.fn(),
  inventory: {} as Record<string, unknown>,
  metadata: new Map<string, { is_archived?: boolean }>(),
}));
vi.mock('@/hooks/useRedirectWorkspace', () => ({
  useRedirectWorkspace: () => ({
    data: { folders: [], tags: [], templates: [], metadata: mocks.metadata },
    isError: false,
  }),
}));
vi.mock('@/components/admin/redirects/RedirectBulkActions', () => ({
  RedirectBulkActions: ({ rows, onClear }: { rows: InventoryRedirect[]; onClear: () => void }) => (
    <div aria-label="Selection fixture">
      {rows.length} selected<button onClick={onClear}>Clear selection</button>
    </div>
  ),
}));
vi.mock('@/hooks/useRedirectInventory', () => ({ useRedirectInventory: () => mocks.inventory }));
vi.mock('@/components/admin/shell/AdminShell', () => ({
  useAdminShell: () => ({ openEditor: mocks.openEditor }),
}));
vi.mock('@/components/admin/redirects/RedirectToolbarActions', () => ({
  RedirectToolbarActions: () => null,
}));

const row = (index: number): InventoryRedirect => ({
  id: `event:${index}`,
  source: `/events/old-${index}`,
  target: `/events/current-${index}`,
  origin: 'event_slug_redirects',
  kind: 'Automatic',
  statusCode: 301,
  state: 'Enabled',
  updatedAt: null,
});
function show(path = '/admin/content/redirects') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminRedirects />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.metadata = new Map();
  mocks.inventory = {
    data: { rows: Array.from({ length: 107 }, (_, index) => row(index)), errors: [] },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: mocks.refetch,
  };
});

describe('unified redirects index', () => {
  it.each(['Excel', 'CSV'] as const)(
    'exports every redirect as %s independently of search and page',
    async (format) => {
      const data = { rows: Array.from({ length: 107 }, (_, index) => row(index)), errors: [] };
      mocks.refetch.mockResolvedValue({ data });
      show();
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search redirects' }), {
        target: { value: 'current-106' },
      });
      fireEvent.click(screen.getByRole('button', { name: `Export ${format}` }));
      await waitFor(() =>
        expect(format === 'CSV' ? exportToCsv : exportToExcel).toHaveBeenCalledWith(
          data.rows,
          expect.any(Array),
          expect.any(String),
        ),
      );
    },
  );

  it('does not export an incomplete redirect inventory', async () => {
    mocks.refetch.mockResolvedValue({ data: { rows: [row(1)], errors: ['missing source'] } });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export CSV' })).not.toBeDisabled(),
    );
    expect(exportToCsv).not.toHaveBeenCalled();
  });

  it('filters all sources by hostname, retains deep links and clears bulk selection', () => {
    const custom = manualRedirect({
      id: 'custom',
      type: 'SHORT',
      slug: 'custom-link',
      domain_id: 'domain',
      domain_hostname: 'links.community.com',
      target: '/events',
      is_enabled: false,
      status_code: 302,
    });
    mocks.inventory.data = { rows: [row(1), custom], errors: [] };
    show();
    fireEvent.click(screen.getByLabelText('Select visible redirects'));
    expect(screen.getByLabelText('Selection fixture')).toHaveTextContent('2 selected');
    fireEvent.change(screen.getByLabelText('Filter by domain'), {
      target: { value: 'links.community.com' },
    });
    expect(screen.getByText('https://links.community.com/custom-link')).toBeVisible();
    expect(screen.queryByText('/events/old-1')).toBeNull();
    expect(screen.queryByLabelText('Selection fixture')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy filtered view' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('of 1 redirects');
  });
  it('does not silently drop an unknown bookmarked domain filter', () => {
    show('/admin/content/redirects?domain=missing.community.com');
    expect(screen.getByLabelText('Filter by domain')).toHaveValue('missing.community.com');
    expect(screen.queryByText('/events/old-0')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('0 redirects');
  });
  it('selects across pages up to 100, then clears selection when filters change', () => {
    show();
    fireEvent.click(screen.getByLabelText('Select visible redirects'));
    expect(screen.getByLabelText('Selection fixture')).toHaveTextContent('50 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByLabelText('Select visible redirects'));
    expect(screen.getByLabelText('Selection fixture')).toHaveTextContent('100 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    for (const checkbox of within(screen.getByRole('table', { name: 'Redirects' }))
      .getAllByRole('checkbox')
      .slice(1))
      expect(checkbox).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search redirects' }), {
      target: { value: 'current-106' },
    });
    expect(screen.queryByLabelText('Selection fixture')).toBeNull();
    expect(screen.getByLabelText('Select /events/old-106')).not.toBeDisabled();
  });
  it('hides archived rows from the active view and exposes an archived-only view', () => {
    mocks.metadata.set('event:0', { is_archived: true });
    show();
    expect(screen.queryByText('/events/old-0')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('of 106 redirects');
    fireEvent.change(screen.getByLabelText('Archive status'), { target: { value: 'archived' } });
    expect(screen.getByText('/events/old-0')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('1–1 of 1 redirects');
  });
  it('paginates the complete list and resets pagination when searching destinations', () => {
    show();
    expect(
      within(screen.getByRole('table', { name: 'Redirects' })).getAllByRole('row'),
    ).toHaveLength(51);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status')).toHaveTextContent('51–100 of 107 redirects');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search redirects' }), {
      target: { value: '/events/current-106' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('1–1 of 1 redirects');
    expect(screen.getByText('/events/old-106')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('reports partial results and exposes a retry instead of saying the inventory is empty', () => {
    mocks.inventory.data = { rows: [row(1)], errors: ['venue_redirects: permission denied'] };
    show();
    expect(screen.getByRole('alert')).toHaveTextContent('incomplete');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('≥ 1');
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed sources' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it('preserves the CMS manual editor and creation while automatic rules stay managed at source', () => {
    mocks.inventory.data = {
      rows: [
        row(1),
        manualRedirect({
          id: 'manual',
          type: 'SHORT',
          slug: 'promo',
          target: '/events',
          status_code: 301,
          is_enabled: true,
        }),
      ],
      errors: [],
    };
    show();
    fireEvent.pointerDown(
      within(screen.getByRole('row', { name: /\/go\/promo/ })).getByRole('button', {
        name: 'Tools',
      }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit redirect' }));
    expect(mocks.openEditor).toHaveBeenCalledWith('redirects', 'manual');
    fireEvent.click(screen.getByRole('button', { name: 'New Redirect' }));
    expect(mocks.openEditor).toHaveBeenCalledWith('redirects', null);
  });
});
