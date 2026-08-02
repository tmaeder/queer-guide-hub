import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Page controls for every view, not just the table.
 *
 * Gallery / Board / Timeline / Calendar shipped without any: they rendered the
 * first page and offered no way to reach the second, so on `events` (~40k rows)
 * you could see 25 records and no more. Extracted here so a new view cannot
 * repeat that by omission.
 */

interface Props {
  page: number;
  rowsPerPage: number;
  totalCount: number;
  setPage: (page: number) => void;
  setRowsPerPage: (rows: number) => void;
  /** Hidden when there is nothing to page through. */
  hidden?: boolean;
}

export function ListPagination({
  page,
  rowsPerPage,
  totalCount,
  setPage,
  setRowsPerPage,
  hidden,
}: Props) {
  if (hidden || totalCount === 0) return null;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const first = page * rowsPerPage + 1;
  const last = Math.min((page + 1) * rowsPerPage, totalCount);

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page:</span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(v) => {
            setRowsPerPage(parseInt(v, 10));
            setPage(0);
          }}
        >
          <SelectTrigger className="h-7 w-[70px] text-xs" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>
          {first}-{last} of {totalCount.toLocaleString()}
        </span>
      </div>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (page > 0) setPage(page - 1);
              }}
              aria-disabled={page === 0}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              {page + 1}
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (page + 1 < totalPages) setPage(page + 1);
              }}
              aria-disabled={page + 1 >= totalPages}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
