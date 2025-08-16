import React, { Suspense, lazy, ComponentType } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface LazyComponentProps {
  factory: () => Promise<{ default: ComponentType<any> }>;
  fallback?: React.ReactNode;
  props?: any;
}

const LazyComponent: React.FC<LazyComponentProps> = ({ 
  factory, 
  fallback = <Skeleton className="h-32 w-full" />, 
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