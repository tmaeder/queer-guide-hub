import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1.5,
        borderTop: '1px solid var(--border, #e4e4e7)',
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {selectedCount > 0 && (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {selectedCount} selected
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {from}-{to} of {totalCount.toLocaleString()}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Rows
          </Typography>
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
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
          <Typography variant="body2" sx={{ px: 1, minWidth: 60, textAlign: 'center' }}>
            {page} / {totalPages || 1}
          </Typography>
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
        </Box>
      </Box>
    </Box>
  );
}
