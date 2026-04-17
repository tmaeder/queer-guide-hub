/**
 * PageLoadingState — Unified skeleton loading for list/grid pages.
 *
 * Renders skeleton cards in a responsive grid on a solid surface.
 * Replaces all per-page spinner/skeleton implementations.
 *
 * Usage:
 *   <PageLoadingState />                        // 6 card skeletons
 *   <PageLoadingState count={4} variant="list" /> // 4 list-item skeletons
 */

import React from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface PageLoadingStateProps {
  /** Number of skeleton items to show */
  count?: number;
  /** Layout variant */
  variant?: 'card' | 'list';
}

export const PageLoadingState: React.FC<PageLoadingStateProps> = ({
  count = 6,
  variant = 'card',
}) => {
  // Skeleton grids get a fade-in entrance so they don't pop in harshly
  const wrapperClass = 'content-crossfade-enter';
  if (variant === 'list') {
    return (
      <Box className={wrapperClass} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i}>
            <CardContent>
              <Skeleton variant="rounded" width={80} height={60} sx={{ flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" height={24} />
                <Skeleton variant="text" width="40%" height={18} />
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <Skeleton variant="rounded" width={50} height={20} />
                  <Skeleton variant="rounded" width={70} height={20} />
                </Box>
              </Box>
              <Skeleton variant="rounded" width={60} height={32} />
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  // Default: card grid
  return (
    <Box
      className={wrapperClass}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
        gap: 3,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="70%" height={24} />
                <Skeleton variant="text" width="40%" height={18} />
              </Box>
            </Box>
            <Skeleton variant="text" width="100%" />
            <Skeleton variant="text" width="60%" />
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Skeleton variant="rounded" width={60} height={24} />
              <Skeleton variant="rounded" width={80} height={24} />
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};
