import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorRetryProps {
  title?: string;
  description?: string;
  /** Underlying error message, exposed for engineers when present. */
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * P6-2 — Recoverable error state for list / detail surfaces. Pairs with
 * EmptyState (no data) and LoadingList (loading). Always show a retry
 * action; the underlying error string surfaces only when provided.
 */
export function ErrorRetry({
  title = 'Something went wrong',
  description = 'We couldn’t load this section. Try again in a moment.',
  error,
  onRetry,
  retryLabel = 'Retry',
}: ErrorRetryProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex flex-col items-center text-center gap-3 py-12 px-4"
    >
      <AlertTriangle size={32} style={{ color: 'hsl(var(--foreground))' }} aria-hidden="true" />
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground" style={{ maxWidth: 480 }}>
        {description}
      </p>
      {error && (
        <p className="text-xs font-mono" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
          {error}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
