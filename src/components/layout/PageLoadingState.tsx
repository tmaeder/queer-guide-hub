/**
 * PageLoadingState — Unified skeleton loading for list/grid pages.
 */

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface PageLoadingStateProps {
  count?: number;
  variant?: 'card' | 'list';
}

export const PageLoadingState = ({
  count = 6,
  variant = 'card',
}) => {
  const wrapperClass = 'content-crossfade-enter';
  if (variant === 'list') {
    return (
      <div className={`${wrapperClass} flex flex-col gap-4`}>
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-3">
              <Skeleton className="w-20 h-15 rounded-lg shrink-0" style={{ height: 60 }} />
              <div className="flex-1">
                <Skeleton className="h-6 w-3/5" />
                <Skeleton className="h-[18px] w-2/5 mt-2" />
                <div className="flex gap-2 mt-1">
                  <Skeleton className="h-5 w-12 rounded-md" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-8 w-16 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={`${wrapperClass} grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent>
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-6 w-[70%]" />
                <Skeleton className="h-[18px] w-2/5 mt-2" />
              </div>
            </div>
            <Skeleton className="h-4 w-full mt-3" />
            <Skeleton className="h-4 w-3/5 mt-2" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-6 w-16 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
