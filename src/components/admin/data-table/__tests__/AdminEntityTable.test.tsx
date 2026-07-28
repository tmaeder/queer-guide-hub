import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { renderWithProviders, screen } from '@/test/test-utils';
import { AdminEntityTable } from '../AdminEntityTable';
import type { AdminTableConfig } from '../types';

// Mock the auth + roles hooks so the guard lets us through.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));
vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({ canManageContent: () => true, loading: false }),
}));

// Mock AdminDataTable so we can assert what config gets passed in.
const dataTableSpy = vi.fn();
vi.mock('../AdminDataTable', () => ({
  AdminDataTable: (props: { config: AdminTableConfig<{ id: string }> }) => {
    dataTableSpy(props.config);
    return <div data-testid="admin-data-table" data-table={props.config.tableName} />;
  },
}));

interface Row {
  id: string;
  name: string;
}
const helper = createColumnHelper<Row>();
const columns = [
  helper.accessor('name', { header: 'Name', cell: (i) => i.getValue() }),
];
const config: AdminTableConfig<Row> = {
  tableName: 'widgets',
  columns,
  searchColumns: ['name'],
};

describe('AdminEntityTable', () => {
  beforeEach(() => {
    dataTableSpy.mockClear();
  });

  it('renders title, subtitle and the data table', () => {
    renderWithProviders(
      <AdminEntityTable title="Widgets" subtitle="manage widgets" config={config} />,
    );
    expect(screen.getByText('Widgets')).toBeInTheDocument();
    expect(screen.getByText('manage widgets')).toBeInTheDocument();
    expect(screen.getByTestId('admin-data-table')).toHaveAttribute('data-table', 'widgets');
  });

  it('forwards config (columns, search wiring) to AdminDataTable', () => {
    renderWithProviders(<AdminEntityTable title="Widgets" config={config} />);
    expect(dataTableSpy).toHaveBeenCalledTimes(1);
    const passed = dataTableSpy.mock.calls[0][0];
    expect(passed.tableName).toBe('widgets');
    expect(passed.columns).toBe(columns);
    expect(passed.searchColumns).toEqual(['name']);
  });

  it('renders beforeTable and afterTable slots', () => {
    renderWithProviders(
      <AdminEntityTable
        title="Widgets"
        config={config}
        beforeTable={<div>before-slot</div>}
        afterTable={<div>after-slot</div>}
      />,
    );
    expect(screen.getByText('before-slot')).toBeInTheDocument();
    expect(screen.getByText('after-slot')).toBeInTheDocument();
  });

  // ── A1: the header moved onto AdminPageHeader ────────────────────────────
  // This component is the single widest lever in the admin console — the 8
  // taxonomy pages plus AdminUsers / AdminHotels / AdminQueerVillages /
  // AdminTags all render through it. It used to hand-roll
  // <h4 className="text-2xl font-bold">, which is both the wrong heading level
  // for a page title and an arbitrary size outside the type scale.

  it('renders the page title as a real h1, not a styled h4', () => {
    renderWithProviders(<AdminEntityTable title="Widgets" config={config} />);
    const heading = screen.getByRole('heading', { name: 'Widgets' });
    expect(heading.tagName).toBe('H1');
  });

  it('renders a back link without doubling the "Back to" prefix', () => {
    // AdminUsers passes backLabel="Back to Admin"; AdminPageHeader already
    // prefixes "Back to", so the raw label would read "Back to Back to Admin".
    renderWithProviders(
      <AdminEntityTable
        title="Users"
        config={config}
        backHref="/admin"
        backLabel="Back to Admin"
      />,
    );
    expect(screen.getByText('Back to Admin')).toBeInTheDocument();
    expect(screen.queryByText(/Back to Back/)).toBeNull();
  });

  it('omits the back link when backHref is null', () => {
    renderWithProviders(
      <AdminEntityTable title="Hotels" config={config} backHref={null} />,
    );
    expect(screen.queryByText(/^Back to/)).toBeNull();
  });
});
