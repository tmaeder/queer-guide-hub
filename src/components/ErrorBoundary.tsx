import { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
  /** Identifier for which section this boundary protects (for logging) */
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    const route = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
    const section = this.props.section || 'app';

    // Report to Sentry
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
      tags: { section, route },
    });

    // Report to Umami if available
    try {
      const umami = (window as unknown as Record<string, unknown>).umami as { track?: (event: string, data: Record<string, string>) => void } | undefined;
      if (umami?.track) {
        umami.track('error_boundary_caught', {
          section,
          route,
          error_name: error.name,
          error_message: error.message?.slice(0, 200),
        });
      }
    } catch {
      // Never throw from error reporting
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Respect an explicitly-provided fallback, including null (render nothing).
      if ('fallback' in this.props) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[50vh] flex items-center justify-center p-8">
          <div className="text-center flex flex-col gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h6 className="text-base font-semibold">Something went wrong</h6>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="text-xs font-mono text-left p-3 bg-muted rounded-lg max-h-40 overflow-auto break-all">
                {this.state.error.name}: {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={() => window.location.href = '/'} size="sm">
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
