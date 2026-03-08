import { Inbox } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';

interface DataTableEmptyStateProps {
  isLoading: boolean;
  hasFilters: boolean;
  columnCount: number;
}

export function DataTableEmptyState({
  isLoading,
  hasFilters,
  columnCount,
}: DataTableEmptyStateProps) {
  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              gap: 2,
              py: 1.5,
              borderBottom: '1px solid var(--border, #e4e4e7)',
            }}
          >
            <Skeleton variant="rectangular" width={20} height={20} sx={{ borderRadius: 0.5 }} />
            {Array.from({ length: Math.min(columnCount, 5) }).map((_, j) => (
              <Skeleton key={j} variant="text" width={j === 0 ? 180 : 100} height={20} />
            ))}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        px: 4,
      }}
    >
      <Inbox
        style={{ height: 48, width: 48, color: 'var(--muted-foreground)', marginBottom: 16 }}
      />
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        No results found
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {hasFilters ? 'Try adjusting your filters or search terms.' : 'No data available yet.'}
      </Typography>
    </Box>
  );
}
