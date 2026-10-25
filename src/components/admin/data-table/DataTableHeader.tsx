import { flexRender, type Header, type RowData } from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ArrowUpDown } from '@/components/icons';
import { TableHead } from '@/components/ui/table';
import type { AdminColumnMeta } from './types';
import type { AdminTableFeatures } from './features';

interface DataTableHeaderCellProps<TData extends RowData> {
  header: Header<AdminTableFeatures, TData, unknown>;
  onSort?: (columnId: string) => void;
  sort?: false | 'asc' | 'desc';
}

export function DataTableHeaderCell<TData extends RowData>({
  header,
  onSort,
  sort,
}: DataTableHeaderCellProps<TData>) {
  const meta = header.column.columnDef.meta as AdminColumnMeta | undefined;
  const canSort = meta?.serverSortable !== false && header.column.getCanSort();
  const sorted = sort ?? header.column.getIsSorted();
  const numeric =
    typeof header.getContext().table?.getRowModel().rows[0]?.getValue(header.column.id) ===
      'number' || /(?:_count|_score)$/.test(header.column.id);

  const handleClick = () => {
    if (canSort && onSort) {
      onSort(header.column.id ?? header.id);
    }
  };

  const label = header.isPlaceholder
    ? null
    : flexRender(header.column.columnDef.header, header.getContext());
  return (
    <TableHead
      className="whitespace-nowrap"
      style={{ textAlign: numeric ? 'right' : 'left' }}
      aria-sort={
        canSort
          ? sorted === 'asc'
            ? 'ascending'
            : sorted === 'desc'
              ? 'descending'
              : 'none'
          : undefined
      }
    >
      {canSort ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex min-h-11 items-center gap-1 rounded-element text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
          <span style={{ opacity: sorted ? 1 : 0.3 }} className="inline-flex" aria-hidden="true">
            {sorted === 'asc' ? (
              <ArrowUp size={14} />
            ) : sorted === 'desc' ? (
              <ArrowDown size={14} />
            ) : (
              <ArrowUpDown size={14} />
            )}
          </span>
        </button>
      ) : (
        label
      )}
    </TableHead>
  );
}
