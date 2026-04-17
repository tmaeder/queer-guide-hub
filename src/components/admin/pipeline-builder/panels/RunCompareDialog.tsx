import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { GitCompare, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { usePipelineRun } from '../hooks/usePipelineHistory';
import { untypedFrom } from '@/integrations/supabase/untyped';

interface RunOption {
  id: string;
  status: string;
  started_at: string;
  items_succeeded: number | null;
  items_total: number | null;
  duration_ms: number | null;
  pipeline_version: number | null;
  pipeline_id: string;
  pipeline_name: string;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

const statusIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  completed: CheckCircle2,
  failed: XCircle,
  running: Clock,
};

const statusClass: Record<string, string> = {
  completed: 'text-green-600 dark:text-green-400',
  failed: 'text-destructive',
  running: 'text-blue-600 dark:text-blue-400',
};

function RunColumn({
  run,
  label,
  options,
  onSelect,
}: {
  run: ReturnType<typeof usePipelineRun>['data'];
  label: 'A' | 'B';
  options: RunOption[];
  onSelect: (runId: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        Run {label}
      </div>
      <Select value={run?.id || '__none__'} onValueChange={(v) => onSelect(v === '__none__' ? undefined : v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select a run..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs italic text-muted-foreground">— Select run —</SelectItem>
          {options.map(o => (
            <SelectItem key={o.id} value={o.id} className="text-xs">
              <span className="font-mono">{o.id.slice(0, 8)}</span>
              {' · '}{o.status}
              {' · '}{formatDistanceToNow(new Date(o.started_at), { addSuffix: true })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {run && (
        <div className="border border-border rounded-md bg-background p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusClass[run.status] || ''}`}>
              {run.status}
            </Badge>
            {run.pipeline_version != null && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">v{run.pipeline_version}</Badge>
            )}
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>duration</span>
            <span className="font-mono tabular-nums text-foreground">{formatDuration(run.duration_ms)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>items</span>
            <span className="font-mono tabular-nums text-foreground">
              <span className="text-green-600 dark:text-green-400">{run.items_succeeded ?? 0}</span>
              <span className="mx-1">/</span>
              {run.items_total ?? 0}
              {run.items_failed > 0 && <span className="text-destructive ml-1">·{run.items_failed}</span>}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>started</span>
            <span className="font-mono text-[11px] text-foreground" title={run.started_at || ''}>
              {run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : '—'}
            </span>
          </div>
          {run.triggered_by && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>trigger</span>
              <span className="font-mono text-[11px] text-foreground">{run.triggered_by}</span>
            </div>
          )}
          {run.error_message && (
            <div className="text-[11px] text-destructive mt-2 pt-2 border-t border-border/40">
              {run.error_message}
            </div>
          )}
        </div>
      )}

      {run?.node_states && (
        <div className="border border-border rounded-md bg-background text-xs overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">
            Per-node
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {Object.entries(run.node_states as Record<string, { status: string; items_out: number; duration_ms?: number; error?: string }>).map(([nodeId, state]) => {
              const Icon = statusIcon[state.status] || Clock;
              return (
                <div key={nodeId} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 last:border-0">
                  <Icon className={`h-3 w-3 shrink-0 ${statusClass[state.status] || 'text-muted-foreground'}`} />
                  <span className="font-mono text-[11px] truncate flex-1" title={nodeId}>{nodeId.slice(0, 24)}</span>
                  <span className="font-mono tabular-nums text-[11px] text-muted-foreground whitespace-nowrap">
                    {state.items_out ?? 0}
                    {state.duration_ms && <span> · {formatDuration(state.duration_ms)}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RunCompareDialog() {
  const [open, setOpen] = useState(false);
  const [runAId, setRunAId] = useState<string | undefined>();
  const [runBId, setRunBId] = useState<string | undefined>();

  const { data: recentRuns = [] } = useQuery({
    queryKey: ['recent-runs-for-compare'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_runs')
        .select('id, status, started_at, items_succeeded, items_total, duration_ms, pipeline_version, pipeline_id, pipeline_name')
        .order('started_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as RunOption[];
    },
    enabled: open,
  });

  const { data: runA } = usePipelineRun(runAId);
  const { data: runB } = usePipelineRun(runBId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <GitCompare className="h-3.5 w-3.5 mr-1.5" />
          Compare runs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Compare two runs
          </DialogTitle>
          <DialogDescription>
            Side-by-side comparison of any two pipeline runs — compare versions, regressions, or successful runs against failed ones.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 overflow-y-auto flex-1 pt-2">
          <RunColumn run={runA} label="A" options={recentRuns} onSelect={setRunAId} />
          <RunColumn run={runB} label="B" options={recentRuns} onSelect={setRunBId} />
        </div>

        {runA && runB && (
          <div className="border-t border-border pt-3 mt-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Diff summary</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="border border-border rounded-md p-2">
                <div className="text-[10px] text-muted-foreground">Duration Δ</div>
                <div className={`text-sm font-mono tabular-nums font-semibold ${
                  (runA.duration_ms || 0) < (runB.duration_ms || 0) ? 'text-green-600 dark:text-green-400'
                  : (runA.duration_ms || 0) > (runB.duration_ms || 0) ? 'text-destructive'
                  : ''
                }`}>
                  {formatDuration(Math.abs((runA.duration_ms || 0) - (runB.duration_ms || 0)))}
                </div>
              </div>
              <div className="border border-border rounded-md p-2">
                <div className="text-[10px] text-muted-foreground">Success Δ</div>
                <div className="text-sm font-mono tabular-nums font-semibold">
                  {(runA.items_succeeded ?? 0) - (runB.items_succeeded ?? 0) >= 0 ? '+' : ''}
                  {(runA.items_succeeded ?? 0) - (runB.items_succeeded ?? 0)}
                </div>
              </div>
              <div className="border border-border rounded-md p-2">
                <div className="text-[10px] text-muted-foreground">Failures Δ</div>
                <div className="text-sm font-mono tabular-nums font-semibold">
                  {(runA.items_failed ?? 0) - (runB.items_failed ?? 0) >= 0 ? '+' : ''}
                  {(runA.items_failed ?? 0) - (runB.items_failed ?? 0)}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
