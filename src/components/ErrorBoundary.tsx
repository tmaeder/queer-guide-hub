import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
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
