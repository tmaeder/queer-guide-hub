import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { LucideIcon } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'brand';
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  mood?: 'neutral' | 'encouraging' | 'playful';
  /** Optional custom content below the description (e.g., dialog triggers) */
  children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  mood = 'neutral',
  children,
}) => {
  const theme = useTheme();
  const brandColor = theme.palette.brand?.main || '#DB2777';

  const iconOpacity = mood === 'playful' ? 0.7 : mood === 'encouraging' ? 0.55 : 0.4;
  const bgOpacity = mood === 'playful' ? '18' : mood === 'encouraging' ? '12' : '0a';

  return (
    <Card>
      <CardContent sx={{ p: 6, textAlign: 'center' }}>
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: `${brandColor}${bgOpacity}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2.5,
          }}
        >
          <Icon
            style={{
              width: 32,
              height: 32,
              color: brandColor,
              opacity: iconOpacity,
            }}
          />
        </Box>
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
          {children}
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
        <Typography variant="body1" color="error.main" sx={{ mb: 2 }}>
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
