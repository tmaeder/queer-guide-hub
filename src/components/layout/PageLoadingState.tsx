/**
 * PageLoadingState — Unified skeleton loading for list/grid pages.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StationRing } from '@/components/transit/StationRing';
import { useLoaderDelay } from '@/components/transit/useLoaderDelay';
import { cn } from '@/lib/utils';

interface PageLoadingStateProps {
  count?: number;
  variant?: 'card' | 'list';
  label?: string;
  slowMessage?: string;
  onRetry?: () => void;
}

export const PageLoadingState = ({
  count = 6,
  variant = 'card',
  label,
  slowMessage,
  onRetry,
}: PageLoadingStateProps) => {
  const { t } = useTranslation();
  const { visible, slow } = useLoaderDelay(true);
  const accessibleLabel = label ?? t('common.loading', 'Loading');
  const wrapperClass = cn('content-crossfade-enter', !visible && 'invisible');

  if (slow) {
    return (
      <Card role="status" aria-live="polite" aria-label={accessibleLabel}>
        <CardContent className="flex items-start gap-4">
          <StationRing state="open" track="pink" className="mt-1 h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold">
              {slowMessage ??
                t(
                  'common.loadingSlow',
                  'This stop is taking longer than expected. The rest of the page is ready.',
                )}
            </p>
            {onRetry && (
              <Button variant="outline" className="mt-4" onClick={onRetry}>
                {t('common.retry', 'Retry')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'list') {
    return (
      <div
        className={cn(wrapperClass, 'relative flex flex-col gap-4')}
        role="status"
        aria-live="polite"
        aria-label={accessibleLabel}
      >
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4">
              <Skeleton className="w-20 h-15 rounded-element shrink-0" style={{ height: 60 }} />
              <div className="flex-1">
                <Skeleton className="h-6 w-3/5" />
                <Skeleton className="h-[18px] w-2/5 mt-2" />
                <div className="flex gap-2 mt-1">
                  <Skeleton className="h-5 w-12 rounded-badge" />
                  <Skeleton className="h-5 w-16 rounded-badge" />
                </div>
              </div>
              <Skeleton className="h-8 w-16 rounded-element" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(wrapperClass, 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3')}
      role="status"
      aria-live="polite"
      aria-label={accessibleLabel}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent>
            <div className="flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-6 w-[70%]" />
                <Skeleton className="h-[18px] w-2/5 mt-2" />
              </div>
            </div>
            <Skeleton className="h-4 w-full mt-4" />
            <Skeleton className="h-4 w-3/5 mt-2" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-6 w-16 rounded-badge" />
              <Skeleton className="h-6 w-20 rounded-badge" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
