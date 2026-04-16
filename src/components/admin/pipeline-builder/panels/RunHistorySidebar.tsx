import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2, Clock, SkipForward, Filter, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePipelineRunsForPipeline } from '../hooks/usePipelineHistory';

interface RunHistorySidebarProps {
  pipelineId: string | undefined;
  activeRunId: string | null;
  onSelectRun: (runId: string | null) => void;
}

type StatusFilter = 'all' | 'completed' | 'failed' | 'running';

const statusIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  completed: CheckCircle2,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
  cancelled: SkipForward,
};

const statusClass: Record<string, string> = {
  completed: 'text-green-600',
  failed: 'text-destructive',
  running: 'text-blue-600 animate-spin',
  pending: 'text-muted-foreground',
  cancelled: 'text-yellow-600',
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export default function RunHistorySidebar({ pipelineId, activeRunId, onSelectRun }: RunHistorySidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const { data: runs = [], isLoading } = usePipelineRunsForPipeline(pipelineId, 25);

  const filtered = filter === 'all' ? runs : runs.filter(r => r.status === filter);
  const counts = {
    all: runs.length,
    completed: runs.filter(r => r.status === 'completed').length,
    failed: runs.filter(r => r.status === 'failed').length,
    running: runs.filter(r => r.status === 'running').length,
  };

  if (collapsed) {
    return (
      <div className="w-8 shrink-0 border-l border-border bg-muted/30 flex flex-col items-center py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(false)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">Show run history</TooltipContent>
        </Tooltip>
        <History className="h-4 w-4 text-muted-foreground mt-2" />
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 border-l border-border bg-muted/20 flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-[13px]">Run History</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(true)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Filter chips */}
      <div className="px-2 py-2 border-b border-border flex gap-1 flex-wrap">
        {(['all', 'completed', 'failed', 'running'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            }`}
          >
            {f}{counts[f] > 0 && <span className="ml-1 opacity-70">{counts[f]}</span>}
          </button>
        ))}
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-xs text-muted-foreground text-center">Loading...</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground text-center">
            <Filter className="h-5 w-5 mx-auto mb-1 opacity-40" />
            {runs.length === 0 ? 'No runs yet' : `No ${filter} runs`}
          </div>
        )}
        {!isLoading && filtered.map(run => {
          const isActive = run.id === activeRunId;
          const Icon = statusIcon[run.status] || Clock;
          const iconClass = statusClass[run.status] || 'text-muted-foreground';
          const timestamp = run.started_at || run.created_at;
          const succeeded = run.items_succeeded ?? 0;
          const total = run.items_total ?? 0;

          return (
            <button
              key={run.id}
              onClick={() => onSelectRun(isActive ? null : run.id)}
              className={`w-full text-left px-3 py-2 border-b border-border/50 transition-colors ${
                isActive ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-accent'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
                <span className="text-[11px] font-mono font-medium truncate flex-1">
                  {run.id.slice(0, 8)}
                </span>
                {run.pipeline_version && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">
                    v{run.pipeline_version}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</span>
                <span className="font-mono">{formatDuration(run.duration_ms)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px]">
                <span className="text-green-700">{succeeded}</span>
                <span className="text-muted-foreground">/</span>
                <span>{total}</span>
                {(run.items_failed ?? 0) > 0 && (
                  <span className="text-destructive ml-1">
                    {run.items_failed} failed
                  </span>
                )}
                <span className="ml-auto text-muted-foreground truncate">
                  {run.triggered_by}
                </span>
              </div>
              {run.error_message && (
                <div className="mt-1 text-[10px] text-destructive truncate" title={run.error_message}>
                  {run.error_message}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      {!isLoading && filtered.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground text-center">
          Showing {filtered.length} of {runs.length} runs
        </div>
      )}
    </div>
  );
}
