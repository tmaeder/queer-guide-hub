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
  errors?: any[];
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
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            {isNetworkError ? (
              <Wifi className="h-5 w-5 text-destructive" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            <CardTitle className="text-lg">
              {isNetworkError ? 'Connection Issue' : 'Something went wrong'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Error Details</AlertTitle>
            <AlertDescription className="text-sm">
              {isNetworkError 
                ? 'Unable to connect to the server. Please check your internet connection and try again.'
                : error?.message || 'An unexpected error occurred. Please try refreshing the page.'
              }
            </AlertDescription>
          </Alert>

          {errors.length > 0 && (
            <Alert>
              <AlertTitle>Additional Issues</AlertTitle>
              <AlertDescription className="text-sm">
                Some features may not work properly due to:
                <ul className="list-disc list-inside mt-2 space-y-1">
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
            <Button 
              onClick={resetErrorBoundary} 
              variant="outline" 
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button 
              onClick={() => window.location.reload()} 
              variant="default"
              className="flex-1"
            >
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Specialized error fallback for data loading errors
export const DataErrorFallback: React.FC<ErrorFallbackProps> = ({ 
  error, 
  resetErrorBoundary,
  errors = []
}) => {
  return (
    <Alert variant="destructive" className="m-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Failed to load data</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Some information couldn't be loaded. You can continue using the app with limited functionality.</p>
        {errors.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer">Show details</summary>
            <ul className="list-disc list-inside mt-1 space-y-1">
              {errors.map((err, i) => (
                <li key={i}>{err?.message || 'Unknown error'}</li>
              ))}
            </ul>
          </details>
        )}
        <Button 
          onClick={resetErrorBoundary} 
          variant="outline" 
          size="sm"
          className="mt-2"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default OptimizedErrorBoundary;