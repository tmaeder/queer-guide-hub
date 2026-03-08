import { flexRender, type Header } from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import type { AdminColumnMeta } from './types';

interface DataTableHeaderCellProps<TData> {
  header: Header<TData, unknown>;
  onSort?: (columnId: string) => void;
}

export function DataTableHeaderCell<TData>({ header, onSort }: DataTableHeaderCellProps<TData>) {
  const meta = header.column.columnDef.meta as AdminColumnMeta | undefined;
  const canSort = meta?.serverSortable !== false && header.column.getCanSort();
  const sorted = header.column.getIsSorted();

  const handleClick = () => {
    if (canSort && onSort) {
      onSort(header.id);
    }
  };

  return (
    <TableHead
      style={{
        cursor: canSort ? 'pointer' : 'default',
        userSelect: canSort ? 'none' : undefined,
        whiteSpace: 'nowrap',
      }}
      onClick={handleClick}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {header.isPlaceholder
          ? null
          : flexRender(header.column.columnDef.header, header.getContext())}
        {canSort && (
          <span style={{ opacity: sorted ? 1 : 0.3, display: 'inline-flex' }}>
            {sorted === 'asc' ? (
              <ArrowUp style={{ height: 14, width: 14 }} />
            ) : sorted === 'desc' ? (
              <ArrowDown style={{ height: 14, width: 14 }} />
            ) : (
              <ArrowUpDown style={{ height: 14, width: 14 }} />
            )}
          </span>
        )}
      </span>
    </TableHead>
  );
}
