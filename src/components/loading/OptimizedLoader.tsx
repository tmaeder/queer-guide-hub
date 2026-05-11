import React from 'react';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface OptimizedLoaderProps {
  type?: 'profile' | 'dashboard' | 'list' | 'card' | 'full';
  count?: number;
  showTitle?: boolean;
}

export const OptimizedLoader = ({
  type = 'card',
  count = 1,
  showTitle = true
}) => {
  if (type === 'profile') {
    return (
      <div className="w-full p-6 flex flex-col gap-6">
        {showTitle && (
          <div className="flex flex-col gap-2">
            <Skeleton />
            <Skeleton />
          </div>
        )}

        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <Skeleton />
              <Skeleton />
            </div>
            <Skeleton />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton />
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <Skeleton />
                  <Skeleton />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton />
                  <Skeleton />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'dashboard') {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        </div>

        <Card>
          <CardHeader>
            <Skeleton />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton />
                  <div className="flex flex-col gap-2 flex-1">
                    <Skeleton />
                    <Skeleton />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton />
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton />
              <Skeleton />
            </div>
            <Skeleton />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'full') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center flex flex-col gap-4 items-center">
          <Loader2 className="animate-spin" size={48} aria-label="Loading" />
          <p className="text-sm text-muted-foreground">Loading your data...</p>
        </div>
      </div>
    );
  }

  // Default card type
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton />
            <Skeleton />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
