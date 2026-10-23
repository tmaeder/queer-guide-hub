/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { deleteRowsByIdsMock } = vi.hoisted(() => ({ deleteRowsByIdsMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ deleteRowsByIds: deleteRowsByIdsMock }));
vi.mock('../DataTableBulkEditDialog', () => ({
  DataTableBulkEditDialog: (p: { open: boolean }) =>
    p.open ? <div data-testid="edit-dlg" /> : null,
}));

vi.mock('@/utils/excelExport', () => ({
  fetchAllRows: vi.fn().mockResolvedValue([{ id: 'a', name: '=SUM(1)' }]),
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));
import { fetchAllRows } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';

import { DataTableBulkActions } from '../DataTableBulkActions';

beforeEach(() => deleteRowsByIdsMock.mockReset());

describe('DataTableBulkActions', () => {
  it('renders nothing when selectedCount=0', () => {
    const { container } = render(
      <DataTableBulkActions
        selectedCount={0}
        selectedIds={new Set()}
        tableName="venues"
        onClearSelection={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders selected count + Clear + Delete', () => {
    render(
      <DataTableBulkActions
        selectedCount={3}
        selectedIds={new Set(['1', '2', '3'])}
        tableName="venues"
        onClearSelection={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
  });

  it('Clear calls onClearSelection', () => {
    const onClear = vi.fn();
    render(
      <DataTableBulkActions
        selectedCount={3}
        selectedIds={new Set(['1'])}
        tableName="venues"
        onClearSelection={onClear}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows Bulk Edit when fields provided', () => {
    render(
      <DataTableBulkActions
        selectedCount={1}
        selectedIds={new Set(['x'])}
        tableName="venues"
        onClearSelection={vi.fn()}
        onSuccess={vi.fn()}
        bulkEditFields={[{ name: 'category', label: 'Category', type: 'text' } as never]}
      />,
    );
    expect(screen.getByRole('button', { name: /Bulk Edit/ })).toBeInTheDocument();
  });

  it('labels selected CSV explicitly and uses paged reads and the shared serializer', async () => {
    render(
      <DataTableBulkActions
        selectedCount={1}
        selectedIds={new Set(['a'])}
        tableName="venues"
        onClearSelection={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export selected (CSV)' }));
    await waitFor(() => expect(exportToCsv).toHaveBeenCalled());
    const call = vi.mocked(fetchAllRows).mock.lastCall!;
    const inFilter = vi.fn();
    call[4]!({ in: inFilter });
    expect(inFilter).toHaveBeenCalledWith('id', ['a']);
    expect(vi.mocked(exportToCsv).mock.lastCall![0]).toEqual([{ id: 'a', name: '=SUM(1)' }]);
  });

  it('Delete flow opens confirm then invokes deleteRowsByIds', async () => {
    deleteRowsByIdsMock.mockResolvedValue({ error: null });
    render(
      <DataTableBulkActions
        selectedCount={2}
        selectedIds={new Set(['a', 'b'])}
        tableName="venues"
        onClearSelection={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(screen.getByText(/Delete 2 items\?/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Delete 2 items/ }));
    await waitFor(() =>
      expect(deleteRowsByIdsMock).toHaveBeenCalledWith(
        'venues',
        expect.arrayContaining(['a', 'b']),
      ),
    );
  });
});
