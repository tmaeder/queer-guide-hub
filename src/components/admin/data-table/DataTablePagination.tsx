import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  selectedCount?: number;
}

const PAGE_SIZES = [10, 25, 50, 100];

export function DataTablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  selectedCount = 0,
}: DataTablePaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between px-4 py-4 border-t border-border-hairline flex-wrap gap-2">
      <div className="flex items-center gap-4">
        {selectedCount > 0 && <p className="text-13 font-medium">{selectedCount} selected</p>}
        <p className="text-13 tabular-nums text-muted-foreground">
          {from}-{to} of {totalCount.toLocaleString()}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex items-center gap-2">
          <p className="text-13 tabular-nums text-muted-foreground">Rows</p>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger aria-label="Rows per page" style={{ width: 70, height: 32 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            aria-label="First page"
            variant="ghost"
            size="icon"
            style={{ height: 44, width: 44 }}
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
          >
            <ChevronsLeft size={14} />
          </Button>
          <Button
            aria-label="Previous page"
            variant="ghost"
            size="icon"
            style={{ height: 44, width: 44 }}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft size={14} />
          </Button>
          <p className="text-13 px-2 min-w-[60px] text-center">
            {page} / {totalPages || 1}
          </p>
          <Button
            aria-label="Next page"
            variant="ghost"
            size="icon"
            style={{ height: 44, width: 44 }}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight size={14} />
          </Button>
          <Button
            aria-label="Last page"
            variant="ghost"
            size="icon"
            style={{ height: 44, width: 44 }}
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
          >
            <ChevronsRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
