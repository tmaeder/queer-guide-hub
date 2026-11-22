import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LucideIcon, X } from '@/components/icons';

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
  // Neutral empties stay quiet; encouraging / playful ones get the ink icon.
  const iconTone = mood === 'neutral' ? 'text-muted-foreground' : 'text-foreground';

  return (
    <Card>
      {/* CardContent is pt-0 by default (it expects a CardHeader above); an
          empty state has none, so it sets its own vertical padding. */}
      <CardContent className="px-6 py-10 text-center md:py-12">
        <div
          aria-hidden
          className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-muted"
        >
          <Icon size={28} className={iconTone} />
        </div>
        {/* A card title, not a page heading: Space Grotesk via font-sans, the
            documented opt-out from the h2 display face. */}
        <h2 className="mb-2 font-sans text-title font-bold">{title}</h2>
        <p className="mx-auto mb-6 max-w-md text-15 leading-relaxed text-muted-foreground">
          {description}
        </p>
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
                  aria-label={`${t('common.remove', 'Remove')} ${chip.label}`}
                  className="inline-flex h-4 w-4 min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
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
      <CardContent className="pt-6">
        <p className="mb-4 text-15 text-muted-foreground">{text}</p>
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
      <CardContent className="pt-6">
        <div role="alert" aria-live="polite">
          <h2
            className={`font-sans text-title font-bold text-destructive ${description ? 'mb-2' : 'mb-4'}`}
          >
            {headline}
          </h2>
          {description && (
            <p className="mb-4 max-w-md text-15 text-muted-foreground">{description}</p>
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
