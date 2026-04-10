import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      const umami = (window as any).umami;
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
        <Box sx={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
          <Box sx={{ maxWidth: 448, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <AlertTriangle style={{ height: 48, width: 48, color: 'var(--destructive)', margin: '0 auto' }} />
            <Typography variant="h6">Something went wrong</Typography>
            <Typography variant="body2" color="text.secondary">
              An unexpected error occurred. Please try refreshing the page.
            </Typography>
            {import.meta.env.DEV && this.state.error && (
              <Typography variant="caption" sx={{
                fontFamily: 'monospace',
                textAlign: 'left',
                p: 1.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                maxHeight: 160,
                overflow: 'auto',
                wordBreak: 'break-all',
              }}>
                {this.state.error.name}: {this.state.error.message}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
              <Button onClick={this.handleRetry} variant="outline" size="sm">
                <RefreshCw style={{ height: 16, width: 16, marginRight: 8 }} />
                Try Again
              </Button>
              <Button onClick={() => window.location.href = '/'} size="sm">
                Go Home
              </Button>
            </Box>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}
