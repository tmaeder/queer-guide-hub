import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface OptimizedLoaderProps {
  type?: 'profile' | 'dashboard' | 'list' | 'card' | 'full';
  count?: number;
  showTitle?: boolean;
}

export const OptimizedLoader: React.FC<OptimizedLoaderProps> = ({
  type = 'card',
  count = 1,
  showTitle = true
}) => {
  if (type === 'profile') {
    return (
      <Box sx={{ width: '100%', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {showTitle && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Skeleton />
            <Skeleton />
          </Box>
        )}

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Skeleton />
              <Skeleton />
            </Box>
            <Skeleton />
          </CardContent>
        </Card>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton />
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton />
                  <Skeleton />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton />
                  <Skeleton />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  if (type === 'dashboard') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton />
                <Skeleton />
              </CardHeader>
              <CardContent>
                <Skeleton />
                <Skeleton />
              </CardContent>
            </Card>
          ))}
        </Box>

        <Card>
          <CardHeader>
            <Skeleton />
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Skeleton />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                    <Skeleton />
                    <Skeleton />
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (type === 'list') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
            <Skeleton />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
              <Skeleton />
              <Skeleton />
            </Box>
            <Skeleton />
          </Box>
        ))}
      </Box>
    );
  }

  if (type === 'full') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <CircularProgress size={48} aria-label="Loading" />
          <Typography variant="body2" color="text.secondary">Loading your data...</Typography>
        </Box>
      </Box>
    );
  }

  // Default card type
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton />
            <Skeleton />
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};
