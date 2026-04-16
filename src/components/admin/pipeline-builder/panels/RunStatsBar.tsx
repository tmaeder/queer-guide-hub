import { X, CheckCircle2, XCircle, Clock, Zap, User, Hash, GitBranch } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePipelineRun } from '../hooks/usePipelineHistory';

interface RunStatsBarProps {
  runId: string;
  onClose: () => void;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

const statusStyles: Record<string, string> = {
  completed: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-muted text-muted-foreground',
  cancelled: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

export default function RunStatsBar({ runId, onClose }: RunStatsBarProps) {
  const { data: run, isLoading } = usePipelineRun(runId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs">
        Loading run details...
      </div>
    );
  }

  if (!run) return null;

  const succeeded = run.items_succeeded ?? 0;
  const total = run.items_total ?? 0;
  const failed = run.items_failed ?? 0;
  const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;

  const started = run.started_at || run.created_at;
  const statusClass = statusStyles[run.status] || statusStyles.pending;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-blue-50/40 text-xs flex-wrap">
      <Badge variant="outline" className={`gap-1 ${statusClass}`}>
        {run.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
        {run.status === 'failed' && <XCircle className="h-3 w-3" />}
        {run.status === 'running' && <Zap className="h-3 w-3 animate-pulse" />}
        {run.status}
      </Badge>

      <span className="flex items-center gap-1 text-muted-foreground">
        <Hash className="h-3 w-3" />
        <code className="font-mono">{run.id.slice(0, 8)}</code>
        {run.pipeline_version && (
          <>
            <span className="mx-0.5">·</span>
            <GitBranch className="h-3 w-3" />
            <span>v{run.pipeline_version}</span>
          </>
        )}
      </span>

      <div className="h-4 w-px bg-border" />

      <span className="flex items-center gap-1" title={started ? format(new Date(started), 'PPpp') : ''}>
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{formatDistanceToNow(new Date(started), { addSuffix: true })}</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono">{formatDuration(run.duration_ms)}</span>
      </span>

      <div className="h-4 w-px bg-border" />

      <span className="flex items-center gap-2">
        <span className="text-green-700 font-semibold">{succeeded}</span>
        <span className="text-muted-foreground">/ {total}</span>
        {failed > 0 && <span className="text-destructive font-semibold">· {failed} failed</span>}
        {total > 0 && (
          <span className={`ml-1 font-mono ${successRate >= 95 ? 'text-green-700' : successRate >= 80 ? 'text-yellow-700' : 'text-destructive'}`}>
            {successRate}%
          </span>
        )}
      </span>

      <div className="h-4 w-px bg-border" />

      <span className="flex items-center gap-1 text-muted-foreground">
        <User className="h-3 w-3" />
        {run.triggered_by || 'unknown'}
      </span>

      {run.error_message && (
        <>
          <div className="h-4 w-px bg-border" />
          <span className="text-destructive truncate max-w-[400px]" title={run.error_message}>
            ⚠ {run.error_message}
          </span>
        </>
      )}

      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto" onClick={onClose} title="Return to latest">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
