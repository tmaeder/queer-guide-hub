import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HomeSectionErrorProps {
  onRetry: () => void;
  title?: string;
  description?: string;
  retrying?: boolean;
  className?: string;
}

/**
 * Recoverable, dimensionally stable state for a homepage band. It is compact
 * enough to sit inside an existing Band and complete enough to replace one
 * when an error boundary catches a render or lazy-chunk failure.
 */
export function HomeSectionError({
  onRetry,
  title,
  description,
  retrying = false,
  className,
}: HomeSectionErrorProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-48 flex-col items-start justify-center gap-4 rounded-container bg-card p-6 shadow-soft',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="text-title font-bold text-foreground">
            {title ?? t('home.sectionError.title', 'This section could not load')}
          </p>
          <p className="mt-2 max-w-xl text-15 text-muted-foreground">
            {description ??
              t(
                'home.sectionError.description',
                'Your place on the page is saved. Try this section again when you are ready.',
              )}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" loading={retrying} onClick={onRetry}>
        <RefreshCw aria-hidden />
        {t('common.tryAgain', 'Try again')}
      </Button>
    </div>
  );
}

export default HomeSectionError;
