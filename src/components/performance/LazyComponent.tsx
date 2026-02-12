import React, { Suspense, lazy, ComponentType } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import Box from '@mui/material/Box';

interface LazyComponentProps {
  factory: () => Promise<{ default: ComponentType<any> }>;
  fallback?: React.ReactNode;
  props?: any;
}

const LazyComponent: React.FC<LazyComponentProps> = ({
  factory,
  fallback = <Box sx={{ height: 128, width: '100%' }}><Skeleton sx={{ height: 128, width: '100%' }} /></Box>,
  props = {}
}) => {
  const Component = lazy(factory);

  return (
    <Suspense fallback={fallback}>
      <Component {...props} />
    </Suspense>
  );
};

export default LazyComponent;
