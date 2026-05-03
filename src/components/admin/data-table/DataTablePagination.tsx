import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
    <div className="flex flex-row items-center justify-between px-4 py-3 border-t border-border flex-wrap gap-2">
      <div className="flex flex-row items-center gap-4">
        {selectedCount > 0 && (
          <p className="text-sm font-medium">{selectedCount} selected</p>
        )}
        <p className="text-sm text-muted-foreground">
          {from}-{to} of {totalCount.toLocaleString()}
        </p>
      </div>

      <div className="flex flex-row items-center gap-4">
        <div className="flex flex-row items-center gap-2">
          <p className="text-sm text-muted-foreground">Rows</p>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger style={{ width: 70, height: 32 }}>
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

        <div className="flex flex-row items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            style={{ height: 32, width: 32 }}
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
          >
            <ChevronsLeft style={{ height: 14, width: 14 }} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            style={{ height: 32, width: 32 }}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft style={{ height: 14, width: 14 }} />
          </Button>
          <p className="text-sm px-2 min-w-[60px] text-center">
            {page} / {totalPages || 1}
          </p>
          <Button
            variant="outline"
            size="icon"
            style={{ height: 32, width: 32 }}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight style={{ height: 14, width: 14 }} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            style={{ height: 32, width: 32 }}
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
          >
            <ChevronsRight style={{ height: 14, width: 14 }} />
          </Button>
        </div>
      </div>
    </div>
  );
}
