import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SearchPaginationProps {
  page: number;
  hitsPerPage: number;
  totalHits: number;
  onPageChange: (page: number) => void;
}

const MAX_NUMBERED = 5;

export const SearchPagination = ({
  page,
  hitsPerPage,
  totalHits,
  onPageChange,
}: SearchPaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(totalHits / hitsPerPage));
  if (totalPages <= 1) return null;

  // Centre a sliding window of MAX_NUMBERED pages around the current page.
  const half = Math.floor(MAX_NUMBERED / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(totalPages, start + MAX_NUMBERED - 1);
  start = Math.max(1, end - MAX_NUMBERED + 1);
  const numbers: number[] = [];
  for (let p = start; p <= end; p++) numbers.push(p);

  return (
    <nav
      aria-label="Search results pages"
      className="flex items-center justify-center"
      style={{ gap: 8, marginTop: 32 }}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft style={{ width: 16, height: 16 }} />
        Prev
      </Button>
      {start > 1 && (
        <Button variant="ghost" size="sm" onClick={() => onPageChange(1)}>
          1
        </Button>
      )}
      {start > 2 && <span aria-hidden="true">…</span>}
      {numbers.map((p) => (
        <Button
          key={p}
          variant={p === page ? 'default' : 'ghost'}
          size="sm"
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onPageChange(p)}
        >
          {p}
        </Button>
      ))}
      {end < totalPages - 1 && <span aria-hidden="true">…</span>}
      {end < totalPages && (
        <Button variant="ghost" size="sm" onClick={() => onPageChange(totalPages)}>
          {totalPages}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        Next
        <ChevronRight style={{ width: 16, height: 16 }} />
      </Button>
    </nav>
  );
};
