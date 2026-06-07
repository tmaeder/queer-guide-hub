/**
 * AdminSection — a granular error boundary for an individual admin panel or
 * dashboard cell. Wraps the shared ErrorBoundary with a compact, card-sized
 * fallback so one widget crashing (e.g. a React #185 render loop) fails soft
 * instead of blanking the whole content pane behind AdminShell's outer
 * route-level boundary. Crashes are still reported to Sentry/Umami via the
 * `section` tag.
 */
import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AdminSectionProps {
  children: ReactNode;
  /** Stable tag for Sentry/Umami grouping (e.g. "cockpit:review-queue"). */
  section: string;
  /** Human label shown in the fallback ("Review queue", "Pipeline runs"). */
  label?: string;
  className?: string;
}

export function AdminSection({ children, section, label, className }: AdminSectionProps) {
  const fallback = (
    <div
      className={`flex flex-col items-center gap-2 rounded-container border border-border bg-muted/30 p-6 text-center ${className ?? ''}`}
      role="alert"
    >
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-13 font-medium">{label ?? 'This section'} failed to load</p>
      <p className="text-2xs text-muted-foreground">The rest of the page is unaffected.</p>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Reload
      </Button>
    </div>
  );

  return (
    <ErrorBoundary section={section} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}
