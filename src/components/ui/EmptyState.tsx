import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LucideIcon, X } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'brand';
}

export interface EmptyStateFilterChip {
  label: string;
  onRemove: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  mood?: 'neutral' | 'encouraging' | 'playful';
  /**
   * 'empty' (default) = module has no data; preserves legacy render.
   * 'filtered' = data exists but filters yielded zero results; renders
   *   the active-filter chip row and a default "Reset filters" action
   *   when onResetFilters is provided and no explicit secondaryAction is set.
   */
  variant?: 'empty' | 'filtered';
  activeFilters?: EmptyStateFilterChip[];
  onResetFilters?: () => void;
  resetFiltersLabel?: string;
  /** Optional custom content below the description (e.g., dialog triggers) */
  children?: React.ReactNode;
}

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  mood = 'neutral',
  variant = 'empty',
  activeFilters,
  onResetFilters,
  resetFiltersLabel,
  children,
}: EmptyStateProps) => {
  const { t } = useTranslation();
  const iconOpacity = mood === 'playful' ? 0.7 : mood === 'encouraging' ? 0.55 : 0.4;
  const bgOpacity = mood === 'playful' ? 0.09 : mood === 'encouraging' ? 0.07 : 0.04;

  return (
    <Card>
      <CardContent>
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: `hsl(var(--foreground) / ${bgOpacity})` }}
        >
          <Icon
            style={{ width: 32, height: 32, opacity: iconOpacity }}
            className="text-foreground"
          />
        </div>
        <h6 className="text-lg font-semibold mb-2">{title}</h6>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{description}</p>
        {variant === 'filtered' && activeFilters && activeFilters.length > 0 && (
          <div
            className="flex flex-wrap gap-2 justify-center mb-6"
            data-testid="empty-state-active-filters"
          >
            {activeFilters.map((chip, i) => (
              <Badge key={`${chip.label}-${i}`} variant="outline" className="gap-1 pr-1">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={t('common.removeFilter', 'Remove {{label}}', { label: chip.label })}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex justify-center gap-4 flex-wrap">
          {primaryAction && (
            <Button
              variant={primaryAction.variant || 'default'}
              onClick={primaryAction.onClick}
              className="px-6"
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction ? (
            <Button
              variant={secondaryAction.variant || 'outline'}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ) : (
            variant === 'filtered' &&
            onResetFilters && (
              <Button variant="outline" onClick={onResetFilters}>
                {resetFiltersLabel ?? t('common.resetFilters', 'Reset filters')}
              </Button>
            )
          )}
          {children}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Loading timeout state — shown when data takes longer than expected.
 */
interface LoadingTimeoutProps {
  message?: string;
  onRetry: () => void;
}

export const LoadingTimeout = ({ message, onRetry }: LoadingTimeoutProps) => {
  const { t } = useTranslation();
  const text =
    message ??
    t(
      'common.loadingTimeout',
      'This is taking longer than expected. Please check your connection or try again.',
    );
  return (
    <Card>
      <CardContent>
        <p className="text-base text-muted-foreground mb-4">{text}</p>
        <Button variant="outline" onClick={onRetry}>
          {t('common.tryAgain', 'Try Again')}
        </Button>
      </CardContent>
    </Card>
  );
};

/**
 * Inline error state — shown when a data fetch fails.
 */
interface ErrorStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'brand';
}

interface ErrorStateProps {
  message?: string;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  primaryAction?: ErrorStateAction;
  secondaryAction?: ErrorStateAction;
}

export const ErrorState = ({
  message,
  title,
  description,
  onRetry,
  retryLabel,
  primaryAction,
  secondaryAction,
}: ErrorStateProps) => {
  const { t } = useTranslation();
  const headline =
    title ??
    message ??
    t('common.errorLoadingData', 'Something went wrong while loading data. Please try again.');
  return (
    <Card>
      <CardContent>
        <div role="alert" aria-live="polite">
          <h2 className={`text-lg font-semibold text-destructive ${description ? 'mb-2' : 'mb-4'}`}>
            {headline}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>
          )}
          <div className="flex flex-wrap gap-4">
            {primaryAction && (
              <Button variant={primaryAction.variant ?? 'default'} onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                variant={secondaryAction.variant ?? 'outline'}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
            {onRetry && !primaryAction && (
              <Button variant="outline" onClick={onRetry}>
                {retryLabel ?? t('common.retry', 'Retry')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
