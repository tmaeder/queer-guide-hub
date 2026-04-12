import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Wifi } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
}

interface ErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => void;
  errors?: Array<{ message?: string }>;
}

class OptimizedErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  { hasError: boolean; error?: Error }
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return (
        <FallbackComponent
          error={this.state.error}
          resetErrorBoundary={() => this.setState({ hasError: false, error: undefined })}
        />
      );
    }

    return this.props.children;
  }
}

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetErrorBoundary,
  errors = []
}) => {
  const isNetworkError = error?.message?.includes('fetch') ||
                        error?.message?.includes('network') ||
                        errors.some(e => e?.message?.includes('fetch'));

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, p: 3 }}>
      <Card sx={{ maxWidth: 'md', width: '100%' }}>
        <CardHeader>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isNetworkError ? (
              <Wifi style={{ height: 20, width: 20, color: 'var(--destructive)' }} />
            ) : (
              <AlertCircle style={{ height: 20, width: 20, color: 'var(--destructive)' }} />
            )}
            <CardTitle sx={{ fontSize: '1.125rem' }}>
              {isNetworkError ? 'Connection Issue' : 'Something went wrong'}
            </CardTitle>
          </Box>
        </CardHeader>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert variant="destructive">
            <AlertTitle>Error Details</AlertTitle>
            <AlertDescription>
              <Typography variant="body2">
                {isNetworkError
                  ? 'Unable to connect to the server. Please check your internet connection and try again.'
                  : error?.message || 'An unexpected error occurred. Please try refreshing the page.'
                }
              </Typography>
            </AlertDescription>
          </Alert>

          {errors.length > 0 && (
            <Alert>
              <AlertTitle>Additional Issues</AlertTitle>
              <AlertDescription>
                <Typography variant="body2">
                  Some features may not work properly due to:
                </Typography>
                <Box component="ul" sx={{ listStyleType: 'disc', listStylePosition: 'inside', mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {errors.slice(0, 3).map((err, i) => (
                    <Typography component="li" key={i} variant="caption">
                      {err?.message || 'Unknown error'}
                    </Typography>
                  ))}
                </Box>
              </AlertDescription>
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={resetErrorBoundary}
              variant="outline"
              sx={{ flex: 1 }}
            >
              <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
              Try Again
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="default"
              sx={{ flex: 1 }}
            >
              Refresh Page
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

// Specialized error fallback for data loading errors
export const DataErrorFallback: React.FC<ErrorFallbackProps> = ({
  _error,
  resetErrorBoundary,
  errors = []
}) => {
  return (
    <Alert variant="destructive" sx={{ m: 2 }}>
      <AlertCircle style={{ height: 16, width: 16 }} />
      <AlertTitle>Failed to load data</AlertTitle>
      <AlertDescription sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="body2">Some information couldn't be loaded. You can continue using the app with limited functionality.</Typography>
        {errors.length > 0 && (
          <Box component="details" sx={{ fontSize: '0.75rem' }}>
            <Box component="summary" sx={{ cursor: 'pointer' }}>Show details</Box>
            <Box component="ul" sx={{ listStyleType: 'disc', listStylePosition: 'inside', mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {errors.map((err, i) => (
                <li key={i}>{err?.message || 'Unknown error'}</li>
              ))}
            </Box>
          </Box>
        )}
        <Button
          onClick={resetErrorBoundary}
          variant="outline"
          size="sm"
          sx={{ mt: 1 }}
        >
          <RefreshCw style={{ height: 12, width: 12, marginRight: 4 }} />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default OptimizedErrorBoundary;
