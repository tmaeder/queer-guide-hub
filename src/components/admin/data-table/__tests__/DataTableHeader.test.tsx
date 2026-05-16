/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Table, TableHeader, TableRow } from '@/components/ui/table';
import { DataTableHeaderCell } from '../DataTableHeader';

function makeHeader(opts: { sorted?: false | 'asc' | 'desc'; canSort?: boolean; serverSortable?: boolean }) {
  return {
    id: 'name',
    isPlaceholder: false,
    column: {
      columnDef: {
        header: 'Name',
        meta: opts.serverSortable === undefined ? undefined : { serverSortable: opts.serverSortable },
      },
      getCanSort: () => opts.canSort ?? true,
      getIsSorted: () => opts.sorted ?? false,
    },
    getContext: () => ({}),
  } as never;
}

function inTable(child: React.ReactNode) {
  return (
    <Table><TableHeader><TableRow>{child}</TableRow></TableHeader></Table>
  );
}

describe('DataTableHeaderCell', () => {
  it('renders the header label', () => {
    render(inTable(<DataTableHeaderCell header={makeHeader({})} />));
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders the ArrowUpDown indicator when unsorted + canSort', () => {
    const { container } = render(inTable(<DataTableHeaderCell header={makeHeader({})} />));
    expect(container.querySelector('svg.lucide-arrow-up-down, svg.lucide-arrow-up-narrow-wide')).not.toBeNull();
  });

  it('renders ArrowUp for asc sort', () => {
    const { container } = render(inTable(<DataTableHeaderCell header={makeHeader({ sorted: 'asc' })} />));
    expect(container.querySelector('svg.lucide-arrow-up')).not.toBeNull();
  });

  it('fires onSort with column id when clicked + sortable', () => {
    const onSort = vi.fn();
    render(inTable(<DataTableHeaderCell header={makeHeader({})} onSort={onSort} />));
    fireEvent.click(screen.getByText('Name'));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('does not call onSort when serverSortable=false', () => {
    const onSort = vi.fn();
    render(inTable(<DataTableHeaderCell header={makeHeader({ serverSortable: false })} onSort={onSort} />));
    fireEvent.click(screen.getByText('Name'));
    expect(onSort).not.toHaveBeenCalled();
  });
});
