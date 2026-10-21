import { Link } from 'react-router';
import { useReviewCleanupStatus } from '@/hooks/useReviewCleanupStatus';
export function ReviewCleanupStatus() {
  const query = useReviewCleanupStatus();
  const status = query.data;
  const lastRun = status?.last_run_at ? new Date(status.last_run_at) : null;
  const stale = lastRun && query.dataUpdatedAt - lastRun.getTime() > 15 * 60_000;
  const message = query.isLoading
    ? 'Checking automatic cleanup…'
    : query.isError || !status
      ? 'Automatic cleanup status is unavailable.'
      : !status.enabled
        ? 'Automatic cleanup is paused.'
        : status.last_run_status === 'error' || stale
          ? 'Automatic cleanup needs attention.'
          : 'Automatic cleanup runs every 5 minutes.';
  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-muted/30 px-4 py-2 text-xs md:px-6"
      aria-label="Automatic queue cleanup"
    >
      <div>
        <span className="font-medium">{message}</span>
        {lastRun && (
          <span className="ml-2 text-muted-foreground">
            Last run {lastRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
          </span>
        )}
        <p className="mt-1 text-muted-foreground">
          Unsupported claims, obsolete findings, broken images and missing business contacts are
          handled automatically. Remaining decisions need evidence or judgment.
        </p>
      </div>
      <Link
        to="/admin/automation"
        className="inline-flex min-h-8 shrink-0 items-center underline underline-offset-4"
      >
        View automation
      </Link>
    </div>
  );
}
