import { ChevronLeft, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  page: number;
  rowsPerPage: number;
  totalCount: number;
  setPage: (page: number) => void;
  setRowsPerPage: (rows: number) => void;
  hidden?: boolean;
}

/** One compact footer shared by all content presentations. */
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
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-border-hairline px-4 py-4 sm:flex">
      <p className="text-13 tabular-nums text-muted-foreground sm:mr-auto">
        {first}-{last} of {totalCount.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-13 text-muted-foreground">Rows</span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(v) => {
            setRowsPerPage(Number(v));
            setPage(0);
          }}
        >
          <SelectTrigger className="h-10 w-20 text-13" aria-label="Rows per page">
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
      </div>
      <nav
        className="col-span-2 flex items-center justify-center gap-2"
        aria-label="Content pagination"
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </Button>
        <span
          className="min-w-16 text-center text-13 tabular-nums"
          aria-label={`Page ${page + 1} of ${totalPages}`}
        >
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Next page"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Next <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}
