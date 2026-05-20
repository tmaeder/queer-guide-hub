/**
 * WorkflowDashboard — Admin dashboard for the pgmq-based workflow orchestration.
 */

import React, { useState, useMemo } from 'react';
import {
  Play,
  RotateCcw,
  XCircle,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  BarChart3,
  RefreshCw,
  Skull,
  Send,
  Heart,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  useWorkflowMonitor,
  type WorkflowRun,
  type WorkflowRunStatus,
  type WorkflowDefinition,
} from '@/hooks/useWorkflowMonitor';
import { formatDistanceToNow, format } from 'date-fns';

// ── Status Helpers ──

const STATUS_CONFIG: Record<
  WorkflowRunStatus,
  {
    label: string;
    tone: string;
    icon: React.ElementType;
  }
> = {
  completed: { label: 'Completed', tone: 'border-emerald-500 text-emerald-700 bg-emerald-50', icon: CheckCircle2 },
  running: { label: 'Running', tone: 'border-blue-500 text-blue-700 bg-blue-50', icon: Loader2 },
  queued: { label: 'Queued', tone: 'border-muted text-muted-foreground', icon: Clock },
  failed: { label: 'Failed', tone: 'border-red-500 text-red-700 bg-red-50', icon: AlertTriangle },
  dead_letter: { label: 'Dead Letter', tone: 'border-red-500 text-red-700 bg-red-50', icon: Skull },
  cancelled: { label: 'Cancelled', tone: 'border-amber-500 text-amber-700 bg-amber-50', icon: XCircle },
};

function StatusChip({ status }: { status: WorkflowRunStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs font-semibold', cfg.tone)}>
      <Icon size={14} />
      {cfg.label}
    </Badge>
  );
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ── Tabs ──

type Tab = 'overview' | 'runs' | 'definitions' | 'dead_letter';
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'runs', label: 'Recent Runs', icon: BarChart3 },
  { key: 'definitions', label: 'Definitions', icon: Zap },
  { key: 'dead_letter', label: 'Dead Letter', icon: Skull },
];

// ── Main Component ──

export function WorkflowDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [statusFilter, setStatusFilter] = useState<WorkflowRunStatus | 'all'>('all');
  const [enqueueDialogOpen, setEnqueueDialogOpen] = useState(false);

  const {
    definitions,
    runs,
    activeRuns,
    deadLetterRuns,
    stats,
    metrics,
    isLoading,
    metricsLoading,
    enqueueWorkflow,
    retryRun,
    cancelRun,
    dispatchNow,
    refetchMetrics,
    isEnqueuing,
    isDispatching,
  } = useWorkflowMonitor();

  const filteredRuns = useMemo(() => {
    if (statusFilter === 'all') return runs;
    return runs.filter((r) => r.status === statusFilter);
  }, [runs, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Workflow Orchestration</h2>
            <p className="text-sm text-muted-foreground">
              pgmq-based job scheduling &amp; monitoring — live updates via Realtime
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchMetrics()}
              disabled={metricsLoading}
            >
              <RefreshCw size={14} className={cn('mr-1', metricsLoading && 'animate-spin')} />
              Metrics
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatchNow()}
              disabled={isDispatching}
            >
              <Play size={14} className="mr-1" />
              Dispatch Now
            </Button>
            <Button size="sm" onClick={() => setEnqueueDialogOpen(true)}>
              <Send size={14} className="mr-1" />
              Enqueue
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors',
                activeTab === key
                  ? 'border-primary font-bold text-primary'
                  : 'border-transparent font-medium text-muted-foreground hover:text-primary',
              )}
            >
              <Icon size={16} />
              {label}
              {key === 'dead_letter' && deadLetterRuns.length > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 h-5 border-red-500 text-[0.7rem] text-red-700"
                >
                  {deadLetterRuns.length}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            activeRuns={activeRuns}
            metrics={metrics}
            definitions={definitions}
          />
        )}
        {activeTab === 'runs' && (
          <RunsTab
            runs={filteredRuns}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRetry={retryRun}
            onCancel={cancelRun}
          />
        )}
        {activeTab === 'definitions' && (
          <DefinitionsTab
            definitions={definitions}
            onEnqueue={enqueueWorkflow}
            isEnqueuing={isEnqueuing}
          />
        )}
        {activeTab === 'dead_letter' && <DeadLetterTab runs={deadLetterRuns} onRetry={retryRun} />}

        {/* Enqueue Dialog */}
        <EnqueueDialog
          open={enqueueDialogOpen}
          onClose={() => setEnqueueDialogOpen(false)}
          definitions={definitions}
          onEnqueue={enqueueWorkflow}
          isEnqueuing={isEnqueuing}
        />
      </div>
    </TooltipProvider>
  );
}

// ── Overview Tab ──

function OverviewTab({
  stats,
  activeRuns,
  metrics,
  definitions,
}: {
  stats: ReturnType<typeof useWorkflowMonitor>['stats'];
  activeRuns: WorkflowRun[];
  metrics: ReturnType<typeof useWorkflowMonitor>['metrics'];
  definitions: WorkflowDefinition[];
}) {
  const statCards = [
    { label: 'Total (24h)', value: stats.totalRuns, color: 'hsl(var(--muted-foreground))' },
    { label: 'Running', value: stats.runningRuns, color: 'hsl(var(--muted-foreground))' },
    { label: 'Completed', value: stats.completedRuns, color: 'hsl(var(--foreground))' },
    { label: 'Failed', value: stats.failedRuns, color: 'hsl(var(--destructive))' },
    { label: 'Queued', value: stats.queuedRuns, color: 'hsl(var(--foreground) / 0.55)' },
    { label: 'Dead Letter', value: stats.deadLetterRuns, color: 'hsl(var(--destructive))' },
    // Admin data-viz palette — documented chromatic exception (CLAUDE.md).
    { label: 'Avg Duration', value: formatDuration(stats.avgDurationMs), color: 'hsl(var(--foreground))' },
    { label: 'Definitions', value: definitions.length, color: 'hsl(var(--muted-foreground))' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-element border bg-card p-4">
            <span className="mb-1 block text-xs text-muted-foreground">{s.label}</span>
            <div className="text-lg font-bold" style={{ color: s.color }}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Active runs */}
      {activeRuns.length > 0 && (
        <div className="rounded-element border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Loader2 size={14} className="animate-spin" />
            Active Runs ({activeRuns.length})
          </h3>
          {activeRuns.map((run) => (
            <div key={run.id} className="flex items-center gap-4 border-t py-2">
              <StatusChip status={run.status} />
              <p className="min-w-[180px] text-sm font-semibold">{run.workflow_name}</p>
              <div className="max-w-[200px] flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${run.progress_pct}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{run.progress_pct}%</span>
              <span className="text-xs text-muted-foreground">
                Attempt {run.attempt}/{run.max_attempts}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Queue metrics */}
      {metrics?.queues && metrics.queues.length > 0 && (
        <div className="rounded-element border bg-card p-4">
          <h3 className="mb-3 text-sm font-bold">Queue Depths</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {metrics.queues.map((q) => (
              <div key={q.queue_name} className="rounded border p-3">
                <span className="text-xs text-muted-foreground">{q.queue_name}</span>
                <div className="text-lg font-bold">{q.queue_length}</div>
                {q.oldest_msg_age_sec != null && (
                  <span className="text-xs text-muted-foreground">
                    Oldest: {formatDuration(q.oldest_msg_age_sec * 1000)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Runs Tab ──

function RunsTab({
  runs,
  statusFilter,
  onStatusFilterChange,
  onRetry,
  onCancel,
}: {
  runs: WorkflowRun[];
  statusFilter: WorkflowRunStatus | 'all';
  onStatusFilterChange: (v: WorkflowRunStatus | 'all') => void;
  onRetry: (id: string) => Promise<unknown>;
  onCancel: (id: string) => Promise<unknown>;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => onStatusFilterChange(v as WorkflowRunStatus | 'all')}
          >
            <SelectTrigger className="h-9 w-[150px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="dead_letter">Dead Letter</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="self-end pb-2 text-sm text-muted-foreground">
          {runs.length} run{runs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-element border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="font-bold">Workflow</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="font-bold">Queue</TableHead>
              <TableHead className="font-bold">Attempt</TableHead>
              <TableHead className="font-bold">Progress</TableHead>
              <TableHead className="font-bold">Duration</TableHead>
              <TableHead className="font-bold">Created</TableHead>
              <TableHead className="font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <React.Fragment key={run.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedRow(expandedRow === run.id ? null : run.id)}
                >
                  <TableCell className="w-8 p-1">
                    {expandedRow === run.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-semibold">{run.workflow_name}</span>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={run.status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[0.7rem]">
                      {run.queue_name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {run.attempt}/{run.max_attempts}
                  </TableCell>
                  <TableCell>
                    {run.items_total > 0 ? (
                      <span className="text-xs">
                        {run.items_processed}/{run.items_total} ({run.progress_pct}%)
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDuration(run.duration_ms)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {(run.status === 'failed' || run.status === 'dead_letter') && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 p-0"
                              onClick={() => onRetry(run.id)}
                            >
                              <RotateCcw size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Retry</TooltipContent>
                        </Tooltip>
                      )}
                      {run.status === 'queued' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 p-0"
                              onClick={() => onCancel(run.id)}
                            >
                              <XCircle size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancel</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {expandedRow === run.id && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-muted/40 py-4">
                      <RunDetail run={run} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center">
                  <span className="text-sm text-muted-foreground">No runs found</span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Run Detail ──

function RunDetail({ run }: { run: WorkflowRun }) {
  return (
    <div className="grid grid-cols-1 gap-4 text-[0.8rem] md:grid-cols-2">
      <div>
        <span className="text-xs font-bold text-muted-foreground">ID</span>
        <p className="font-mono text-xs">{run.id}</p>
      </div>
      <div>
        <span className="text-xs font-bold text-muted-foreground">Triggered By</span>
        <p className="text-sm">{run.triggered_by}</p>
      </div>
      {run.error_message && (
        <div className="col-span-full">
          <span className="text-xs font-bold text-red-600">Error</span>
          <p className="whitespace-pre-wrap font-mono text-xs text-red-600">
            {run.error_message}
          </p>
        </div>
      )}
      {run.output_result && (
        <div className="col-span-full">
          <span className="text-xs font-bold text-muted-foreground">Output</span>
          <pre className="max-h-[200px] overflow-auto rounded bg-background p-2 font-mono text-[0.7rem]">
            {JSON.stringify(run.output_result, null, 2)}
          </pre>
        </div>
      )}
      {run.input_payload && Object.keys(run.input_payload).length > 0 && (
        <div className="col-span-full">
          <span className="text-xs font-bold text-muted-foreground">Input Payload</span>
          <pre className="max-h-[150px] overflow-auto rounded bg-background p-2 font-mono text-[0.7rem]">
            {JSON.stringify(run.input_payload, null, 2)}
          </pre>
        </div>
      )}
      <div>
        <span className="text-xs font-bold text-muted-foreground">Timing</span>
        <p className="text-xs">
          Queued: {format(new Date(run.queued_at), 'HH:mm:ss')}
          {run.started_at && ` · Started: ${format(new Date(run.started_at), 'HH:mm:ss')}`}
          {run.completed_at && ` · Done: ${format(new Date(run.completed_at), 'HH:mm:ss')}`}
        </p>
      </div>
      <div>
        <span className="text-xs font-bold text-muted-foreground">Items</span>
        <p className="text-xs">
          Total: {run.items_total} · Processed: {run.items_processed} · Succeeded:{' '}
          {run.items_succeeded} · Failed: {run.items_failed}
        </p>
      </div>
    </div>
  );
}

// ── Definitions Tab ──

function DefinitionsTab({
  definitions,
  onEnqueue,
  isEnqueuing,
}: {
  definitions: WorkflowDefinition[];
  onEnqueue: (args: { workflow: string }) => Promise<unknown>;
  isEnqueuing: boolean;
}) {
  return (
    <div className="rounded-element border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-bold">Name</TableHead>
            <TableHead className="font-bold">Edge Function</TableHead>
            <TableHead className="font-bold">Queue</TableHead>
            <TableHead className="font-bold">Schedule</TableHead>
            <TableHead className="font-bold">Priority</TableHead>
            <TableHead className="font-bold">Retries</TableHead>
            <TableHead className="font-bold">Concurrency</TableHead>
            <TableHead className="font-bold">Enabled</TableHead>
            <TableHead className="font-bold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((def) => (
            <TableRow key={def.id}>
              <TableCell>
                <span className="text-sm font-semibold">{def.name}</span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono text-[0.7rem]">
                  {def.edge_function}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className="text-[0.7rem]">{def.queue_name}</Badge>
              </TableCell>
              <TableCell>
                {def.schedule ? (
                  <span className="font-mono text-xs">{def.schedule}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Manual</span>
                )}
              </TableCell>
              <TableCell>{def.priority}</TableCell>
              <TableCell>{def.max_retries}</TableCell>
              <TableCell>{def.max_concurrency}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[0.7rem]',
                    def.is_enabled ? 'border-emerald-500 text-emerald-700' : '',
                  )}
                >
                  {def.is_enabled ? 'Yes' : 'No'}
                </Badge>
              </TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 p-0"
                      disabled={!def.is_enabled || isEnqueuing}
                      onClick={() => onEnqueue({ workflow: def.name })}
                    >
                      <Play size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Enqueue {def.name}</TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Dead Letter Tab ──

function DeadLetterTab({
  runs,
  onRetry,
}: {
  runs: WorkflowRun[];
  onRetry: (id: string) => Promise<unknown>;
}) {
  if (runs.length === 0) {
    return (
      <div className="py-16 text-center">
        <Heart size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
        <h3 className="text-lg text-muted-foreground">No dead letter messages</h3>
        <p className="text-sm text-muted-foreground">
          All workflows are completing successfully.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-element bg-red-600 p-4 text-white">
        <AlertTriangle size={18} />
        <p className="text-sm font-semibold">
          {runs.length} workflow{runs.length !== 1 ? 's' : ''} in dead letter queue — review and
          retry or discard.
        </p>
      </div>
      {runs.map((run) => (
        <div
          key={run.id}
          className="rounded-element border border-red-300 bg-card p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold">{run.workflow_name}</h4>
              <StatusChip status={run.status} />
            </div>
            <Button variant="outline" size="sm" onClick={() => onRetry(run.id)}>
              <RotateCcw size={14} className="mr-1" />
              Retry
            </Button>
          </div>
          {run.error_message && (
            <p className="mb-2 font-mono text-xs text-red-600">{run.error_message}</p>
          )}
          <span className="text-xs text-muted-foreground">
            Attempt {run.attempt}/{run.max_attempts} ·{' '}
            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Enqueue Dialog ──

function EnqueueDialog({
  open,
  onClose,
  definitions,
  onEnqueue,
  isEnqueuing,
}: {
  open: boolean;
  onClose: () => void;
  definitions: WorkflowDefinition[];
  onEnqueue: (args: { workflow: string; payload?: Record<string, unknown> }) => Promise<unknown>;
  isEnqueuing: boolean;
}) {
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [payloadStr, setPayloadStr] = useState('{}');
  const [payloadError, setPayloadError] = useState('');

  const handleEnqueue = async () => {
    if (!selectedWorkflow) return;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadStr);
      setPayloadError('');
    } catch {
      setPayloadError('Invalid JSON');
      return;
    }
    await onEnqueue({ workflow: selectedWorkflow, payload });
    onClose();
    setSelectedWorkflow('');
    setPayloadStr('{}');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enqueue Workflow</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-2">
            <Label>Workflow</Label>
            <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
              <SelectTrigger>
                <SelectValue placeholder="Select a workflow..." />
              </SelectTrigger>
              <SelectContent>
                {definitions
                  .filter((d) => d.is_enabled)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name} ({d.queue_name})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wf-payload">Payload (JSON)</Label>
            <Textarea
              id="wf-payload"
              rows={4}
              value={payloadStr}
              onChange={(e) => {
                setPayloadStr(e.target.value);
                setPayloadError('');
              }}
              className={cn('font-mono text-xs', payloadError && 'border-destructive')}
            />
            {payloadError && <p className="text-xs text-destructive">{payloadError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleEnqueue} disabled={!selectedWorkflow || isEnqueuing}>
            {isEnqueuing ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <Send size={14} className="mr-1" />
            )}
            Enqueue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
