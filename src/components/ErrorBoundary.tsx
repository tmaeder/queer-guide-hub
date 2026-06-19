import { Component, ErrorInfo, ReactNode, useMemo, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home, Search, MapPin, CalendarDays, Map, Clock } from 'lucide-react';
import { fileError } from '@/utils/autoFileError';
import { getRecentlyViewed, recentlyViewedHref } from '@/lib/recentlyViewed';

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

    // File into the in-app feedback board (deduped + autotriaged server-side).
    fileError({
      kind: 'error_boundary',
      error,
      routePath: route,
      extra: { section, component_stack: errorInfo.componentStack?.slice(0, 1000) },
    });
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
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Render-side fallback so we can read the QueryClient via a hook. "Try Again"
 * invalidates all queries before resetting the boundary, otherwise a query in
 * an error state would re-throw on the next render.
 */
function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  // useQueryClient may throw if there's no QueryClientProvider above us
  // (very-early-boot path uses the outer boundary before providers mount).
  // Guard defensively.
  let queryClient: ReturnType<typeof useQueryClient> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- intentional defensive call; see comment above
    queryClient = useQueryClient();
  } catch {
    queryClient = null;
  }

  const handleRetry = () => {
    if (queryClient) {
      try {
        queryClient.invalidateQueries();
      } catch {
        // Never block retry on cache invalidation failure.
      }
    }
    onRetry();
  };

  // This fallback renders OUTSIDE BrowserRouter / AppProviders (see App.tsx),
  // so it must stay dependency-light: no router hooks, no AuthProvider, no
  // QueryClient. Recently-viewed is pure localStorage; navigation uses plain
  // anchors + window.location.
  const recent = useMemo(() => getRecentlyViewed().slice(0, 6), []);
  const [searchQuery, setSearchQuery] = useState('');
  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) window.location.assign(`/search?q=${encodeURIComponent(q)}`);
  };

  const JUMP_LINKS = [
    { href: '/venues', icon: MapPin, label: 'Venues' },
    { href: '/events', icon: CalendarDays, label: 'Events' },
    { href: '/map', icon: Map, label: 'Map' },
    { href: '/', icon: Home, label: 'Home' },
  ];

  return (
    <div className="min-h-[60vh] bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="text-center flex flex-col gap-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h6 className="text-title font-semibold">Something went wrong</h6>
          <p className="text-muted-foreground">
            An unexpected error occurred. Try again, or pick up from one of the links below.
          </p>
          {import.meta.env.DEV && error && (
            <pre className="text-xs font-mono text-left p-4 bg-muted rounded-element max-h-40 overflow-auto break-all">
              {error.name}: {error.message}
            </pre>
          )}
          <div className="flex gap-4 justify-center">
            <Button onClick={handleRetry} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={() => window.location.assign('/')} size="sm">
              Go Home
            </Button>
          </div>
        </div>

        {/* Search the site directly. */}
        <form onSubmit={onSearch} className="mt-12 relative" role="search">
          <Search
            size={18}
            aria-hidden="true"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search venues, events, cities…"
            aria-label="Search venues, events, cities…"
            className="w-full h-12 pl-12 pr-4 rounded-element border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
          />
        </form>

        {/* Pick up where you left off — pure localStorage, no providers needed. */}
        {recent.length > 0 && (
          <div className="mt-10">
            <p className="text-xs2 font-medium uppercase tracking-[0.14em] text-muted-foreground mb-4 flex items-center gap-2">
              <Clock size={14} aria-hidden="true" />
              Pick up where you left off
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {recent.map((item) => (
                <a
                  key={`${item.type}:${item.slug}`}
                  href={recentlyViewedHref(item)}
                  className="flex flex-col gap-1 rounded-element border border-border bg-background px-4 py-3 no-underline transition-colors hover:bg-surface-container hover:border-foreground/30"
                >
                  <span className="text-15 font-medium text-foreground truncate">{item.title}</span>
                  {(item.city || item.country) && (
                    <span className="text-13 text-muted-foreground truncate">
                      {[item.city, item.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Static jump-links. */}
        <div className="mt-12 border-t border-border pt-8">
          <p className="text-xs2 font-medium uppercase tracking-[0.14em] text-muted-foreground mb-4">
            Or jump to
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {JUMP_LINKS.map(({ href, icon: Icon, label }) => (
              <a
                key={href}
                href={href}
                className="flex flex-col items-center gap-2 rounded-element border border-border bg-background px-4 py-6 no-underline transition-colors hover:bg-surface-container hover:border-foreground/30"
              >
                <Icon size={20} aria-hidden="true" className="text-muted-foreground" />
                <span className="text-13 font-medium text-foreground">{label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
