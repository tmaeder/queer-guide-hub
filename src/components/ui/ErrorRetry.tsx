import { AlertTriangle } from 'lucide-react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
  const theme = useTheme();
  const brandColor = theme.palette.brand?.main || theme.palette.primary.main;

  return (
    <Box
      role="alert"
      aria-live="polite"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1.5,
        py: 6,
        px: 2,
      }}
    >
      <AlertTriangle size={32} style={{ color: brandColor }} aria-hidden="true" />
      <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
        {description}
      </Typography>
      {error && (
        <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace' }}>
          {error}
        </Typography>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </Box>
  );
}
