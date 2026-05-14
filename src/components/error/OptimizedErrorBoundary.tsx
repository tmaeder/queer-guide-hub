import React from 'react';
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

const DefaultErrorFallback = ({
  error,
  resetErrorBoundary,
  errors = [],
}) => {
  const isNetworkError =
    error?.message?.includes('fetch') ||
    error?.message?.includes('network') ||
    errors.some((e) => e?.message?.includes('fetch'));

  return (
    <div className="flex items-center justify-center p-6" style={{ minHeight: 400 }}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {isNetworkError ? (
              <Wifi style={{ height: 20, width: 20, color: 'var(--destructive)' }} />
            ) : (
              <AlertCircle style={{ height: 20, width: 20, color: 'var(--destructive)' }} />
            )}
            <CardTitle>{isNetworkError ? 'Connection Issue' : 'Something went wrong'}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Error Details</AlertTitle>
            <AlertDescription>
              <p className="text-sm">
                {isNetworkError
                  ? 'Unable to connect to the server. Please check your internet connection and try again.'
                  : error?.message ||
                    'An unexpected error occurred. Please try refreshing the page.'}
              </p>
            </AlertDescription>
          </Alert>

          {errors.length > 0 && (
            <Alert>
              <AlertTitle>Additional Issues</AlertTitle>
              <AlertDescription>
                <p className="text-sm">Some features may not work properly due to:</p>
                <ul className="list-disc list-inside mt-2 flex flex-col gap-1">
                  {errors.slice(0, 3).map((err, i) => (
                    <li key={i} className="text-xs">
                      {err?.message || 'Unknown error'}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button onClick={resetErrorBoundary} variant="outline">
              <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
              Try Again
            </Button>
            <Button onClick={() => window.location.reload()} variant="default">
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const DataErrorFallback = ({
  resetErrorBoundary,
  errors = [],
}) => {
  return (
    <Alert variant="destructive">
      <AlertCircle style={{ height: 16, width: 16 }} />
      <AlertTitle>Failed to load data</AlertTitle>
      <AlertDescription>
        <p className="text-sm">
          Some information couldn't be loaded. You can continue using the app with limited
          functionality.
        </p>
        {errors.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer">Show details</summary>
            <ul className="list-disc list-inside mt-1 flex flex-col gap-1">
              {errors.map((err, i) => (
                <li key={i}>{err?.message || 'Unknown error'}</li>
              ))}
            </ul>
          </details>
        )}
        <Button onClick={resetErrorBoundary} variant="outline" size="sm">
          <RefreshCw style={{ height: 12, width: 12, marginRight: 4 }} />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default OptimizedErrorBoundary;
