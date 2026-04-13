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
            <Skeleton sx={{ height: 32, width: 256 }} />
            <Skeleton sx={{ height: 16, width: 384 }} />
          </Box>
        )}

        <Card>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Skeleton sx={{ height: 16, width: 128 }} />
              <Skeleton sx={{ height: 16, width: 48 }} />
            </Box>
            <Skeleton sx={{ height: 8, width: '100%' }} />
          </CardContent>
        </Card>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton sx={{ height: 24, width: 128 }} />
              </CardHeader>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton sx={{ height: 16, width: 96 }} />
                  <Skeleton sx={{ height: 40, width: '100%' }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton sx={{ height: 16, width: 96 }} />
                  <Skeleton sx={{ height: 40, width: '100%' }} />
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
              <CardHeader sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <Skeleton sx={{ height: 16, width: 96 }} />
                <Skeleton sx={{ height: 16, width: 16 }} />
              </CardHeader>
              <CardContent>
                <Skeleton sx={{ height: 32, width: 64, mb: 1 }} />
                <Skeleton sx={{ height: 12, width: 128 }} />
              </CardContent>
            </Card>
          ))}
        </Box>

        <Card>
          <CardHeader>
            <Skeleton sx={{ height: 24, width: 128 }} />
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Skeleton sx={{ height: 40, width: 40, borderRadius: '50%' }} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                    <Skeleton sx={{ height: 16, width: '100%' }} />
                    <Skeleton sx={{ height: 12, width: '75%' }} />
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
            <Skeleton sx={{ height: 48, width: 48, borderRadius: '50%' }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
              <Skeleton sx={{ height: 16, width: '100%' }} />
              <Skeleton sx={{ height: 12, width: '66%' }} />
            </Box>
            <Skeleton sx={{ height: 32, width: 80 }} />
          </Box>
        ))}
      </Box>
    );
  }

  if (type === 'full') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <CircularProgress size={48} />
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
            <Skeleton sx={{ height: 24, width: '75%' }} />
            <Skeleton sx={{ height: 16, width: '50%' }} />
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Skeleton sx={{ height: 16, width: '100%' }} />
              <Skeleton sx={{ height: 16, width: '83%' }} />
              <Skeleton sx={{ height: 16, width: '66%' }} />
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};
