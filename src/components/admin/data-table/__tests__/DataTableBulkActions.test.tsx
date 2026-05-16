/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { deleteRowsByIdsMock } = vi.hoisted(() => ({ deleteRowsByIdsMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ deleteRowsByIds: deleteRowsByIdsMock }));
vi.mock('../DataTableBulkEditDialog', () => ({
  DataTableBulkEditDialog: (p: { open: boolean }) => (p.open ? <div data-testid="edit-dlg" /> : null),
}));

import { DataTableBulkActions } from '../DataTableBulkActions';

beforeEach(() => deleteRowsByIdsMock.mockReset());

describe('DataTableBulkActions', () => {
  it('renders nothing when selectedCount=0', () => {
    const { container } = render(
      <DataTableBulkActions selectedCount={0} selectedIds={new Set()} tableName="venues"
        onClearSelection={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders selected count + Clear + Delete', () => {
    render(
      <DataTableBulkActions selectedCount={3} selectedIds={new Set(['1','2','3'])} tableName="venues"
        onClearSelection={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
  });

  it('Clear calls onClearSelection', () => {
    const onClear = vi.fn();
    render(
      <DataTableBulkActions selectedCount={3} selectedIds={new Set(['1'])} tableName="venues"
        onClearSelection={onClear} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows Bulk Edit when fields provided', () => {
    render(
      <DataTableBulkActions selectedCount={1} selectedIds={new Set(['x'])} tableName="venues"
        onClearSelection={vi.fn()} onSuccess={vi.fn()}
        bulkEditFields={[{ name: 'category', label: 'Category', type: 'text' } as never]} />,
    );
    expect(screen.getByRole('button', { name: /Bulk Edit/ })).toBeInTheDocument();
  });

  it('Delete flow opens confirm then invokes deleteRowsByIds', async () => {
    deleteRowsByIdsMock.mockResolvedValue({ error: null });
    render(
      <DataTableBulkActions selectedCount={2} selectedIds={new Set(['a','b'])} tableName="venues"
        onClearSelection={vi.fn()} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(screen.getByText(/Delete 2 items\?/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Delete 2 items/ }));
    await waitFor(() => expect(deleteRowsByIdsMock).toHaveBeenCalledWith('venues', expect.arrayContaining(['a','b'])));
  });
});
