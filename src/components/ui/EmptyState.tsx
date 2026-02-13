import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { LucideIcon } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}) => {
  return (
    <Card>
      <CardContent sx={{ p: 6, textAlign: 'center' }}>
        <Icon
          style={{
            width: 48,
            height: 48,
            margin: '0 auto 16px',
            color: '#999999',
          }}
        />
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          {title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, maxWidth: '28rem', mx: 'auto' }}
        >
          {description}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
          {primaryAction && (
            <Button
              variant={primaryAction.variant || 'default'}
              onClick={primaryAction.onClick}
              style={{ paddingLeft: 24, paddingRight: 24 }}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'outline'}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </Box>
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

export const LoadingTimeout: React.FC<LoadingTimeoutProps> = ({
  message = 'This is taking longer than expected. Please check your connection or try again.',
  onRetry,
}) => {
  return (
    <Card>
      <CardContent sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {message}
        </Typography>
        <Button variant="outline" onClick={onRetry}>
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
};

/**
 * Inline error state — shown when a data fetch fails.
 */
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Something went wrong while loading data. Please try again.',
  onRetry,
}) => {
  return (
    <Card>
      <CardContent sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body1" sx={{ mb: 2, color: '#d32f2f' }}>
          {message}
        </Typography>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
