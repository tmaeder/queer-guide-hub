/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({
  updateRowsByIds: vi.fn().mockResolvedValue({ error: null }),
}));

import { DataTableBulkEditDialog } from '../DataTableBulkEditDialog';

const fields = [
  { key: 'category', column: 'category', label: 'Category', type: 'text' },
  { key: 'active', column: 'is_active', label: 'Active', type: 'boolean' },
] as never;

describe('DataTableBulkEditDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <DataTableBulkEditDialog open={false} onOpenChange={vi.fn()}
        fields={fields} selectedIds={new Set(['1'])} tableName="venues" onSuccess={vi.fn()} />,
    );
    expect(screen.queryByText(/Bulk Edit/)).toBeNull();
  });

  it('renders one row per field with Apply count', () => {
    render(
      <DataTableBulkEditDialog open onOpenChange={vi.fn()}
        fields={fields} selectedIds={new Set(['1', '2', '3'])} tableName="venues" onSuccess={vi.fn()} />,
    );
    expect(screen.getByText('Bulk Edit 3 items')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('Apply disabled until a field checked', () => {
    render(
      <DataTableBulkEditDialog open onOpenChange={vi.fn()}
        fields={fields} selectedIds={new Set(['1'])} tableName="venues" onSuccess={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Apply to 1 items/ })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByRole('button', { name: /Apply to 1 items/ })).not.toBeDisabled();
  });

  it('Cancel calls onOpenChange(false)', () => {
    const onOpen = vi.fn();
    render(
      <DataTableBulkEditDialog open onOpenChange={onOpen}
        fields={fields} selectedIds={new Set(['1'])} tableName="venues" onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onOpen).toHaveBeenCalledWith(false);
  });
});
