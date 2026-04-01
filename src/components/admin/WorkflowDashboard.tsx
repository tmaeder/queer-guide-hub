/**
 * WorkflowDashboard — Admin dashboard for the pgmq-based workflow orchestration.
 *
 * Live-updating via Supabase Realtime (no polling).
 * Tabs: Overview · Runs · Definitions · Dead Letter
 */

import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
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
import {
  useWorkflowMonitor,
  type WorkflowRun,
  type WorkflowRunStatus,
  type WorkflowDefinition,
} from '@/hooks/useWorkflowMonitor';
import { formatDistanceToNow, format } from 'date-fns';

// ── Status Helpers ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  WorkflowRunStatus,
  { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default'; icon: React.ElementType }
> = {
  completed: { label: 'Completed', color: 'success', icon: CheckCircle2 },
  running: { label: 'Running', color: 'info', icon: Loader2 },
  queued: { label: 'Queued', color: 'default', icon: Clock },
  failed: { label: 'Failed', color: 'error', icon: AlertTriangle },
  dead_letter: { label: 'Dead Letter', color: 'error', icon: Skull },
  cancelled: { label: 'Cancelled', color: 'warning', icon: XCircle },
};

function StatusChip({ status }: { status: WorkflowRunStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  return (
    <Chip
      size="small"
      label={cfg.label}
      color={cfg.color}
      icon={<Icon size={14} />}
      sx={{ fontWeight: 600, fontSize: '0.75rem' }}
    />
  );
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ── Tab Definitions ─────────────────────────────────────────────────────────────

type Tab = 'overview' | 'runs' | 'definitions' | 'dead_letter';
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'runs', label: 'Recent Runs', icon: BarChart3 },
  { key: 'definitions', label: 'Definitions', icon: Zap },
  { key: 'dead_letter', label: 'Dead Letter', icon: Skull },
];

// ── Main Component ──────────────────────────────────────────────────────────────

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
    healthCheck,
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
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Workflow Orchestration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            pgmq-based job scheduling &amp; monitoring — live updates via Realtime
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchMetrics()}
            disabled={metricsLoading}
          >
            <RefreshCw size={14} className={metricsLoading ? 'animate-spin' : ''} />
            Metrics
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatchNow()}
            disabled={isDispatching}
          >
            <Play size={14} />
            Dispatch Now
          </Button>
          <Button size="sm" onClick={() => setEnqueueDialogOpen(true)}>
            <Send size={14} />
            Enqueue
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ display: 'flex', gap: 1, borderBottom: 1, borderColor: 'divider', pb: 0 }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <Box
            key={key}
            onClick={() => setActiveTab(key)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 2,
              py: 1.25,
              cursor: 'pointer',
              borderBottom: 2,
              borderColor: activeTab === key ? 'primary.main' : 'transparent',
              color: activeTab === key ? 'primary.main' : 'text.secondary',
              fontWeight: activeTab === key ? 700 : 500,
              fontSize: '0.875rem',
              transition: 'all 0.15s',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <Icon size={16} />
            {label}
            {key === 'dead_letter' && deadLetterRuns.length > 0 && (
              <Chip size="small" label={deadLetterRuns.length} color="error" sx={{ ml: 0.5, height: 20, fontSize: '0.7rem' }} />
            )}
          </Box>
        ))}
      </Box>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab stats={stats} activeRuns={activeRuns} metrics={metrics} definitions={definitions} />
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
        <DefinitionsTab definitions={definitions} onEnqueue={enqueueWorkflow} isEnqueuing={isEnqueuing} />
      )}
      {activeTab === 'dead_letter' && (
        <DeadLetterTab runs={deadLetterRuns} onRetry={retryRun} />
      )}

      {/* Enqueue Dialog */}
      <EnqueueDialog
        open={enqueueDialogOpen}
        onClose={() => setEnqueueDialogOpen(false)}
        definitions={definitions}
        onEnqueue={enqueueWorkflow}
        isEnqueuing={isEnqueuing}
      />
    </Box>
  );
}

// ── Overview Tab ────────────────────────────────────────────────────────────────

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
    { label: 'Total (24h)', value: stats.totalRuns, color: '#6366f1' },
    { label: 'Running', value: stats.runningRuns, color: '#3b82f6' },
    { label: 'Completed', value: stats.completedRuns, color: '#10b981' },
    { label: 'Failed', value: stats.failedRuns, color: '#ef4444' },
    { label: 'Queued', value: stats.queuedRuns, color: '#f59e0b' },
    { label: 'Dead Letter', value: stats.deadLetterRuns, color: '#dc2626' },
    { label: 'Avg Duration', value: formatDuration(stats.avgDurationMs), color: '#DB2777' },
    { label: 'Definitions', value: definitions.length, color: '#64748b' },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Stat cards */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(4, 1fr)',
            lg: 'repeat(8, 1fr)',
          },
        }}
      >
        {statCards.map((s) => (
          <Box
            key={s.label}
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              {s.label}
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: s.color }}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Active runs */}
      {activeRuns.length > 0 && (
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider', p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
            Active Runs ({activeRuns.length})
          </Typography>
          {activeRuns.map((run) => (
            <Box key={run.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
              <StatusChip status={run.status} />
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 180 }}>
                {run.workflow_name}
              </Typography>
              <Box sx={{ flex: 1, maxWidth: 200 }}>
                <LinearProgress
                  variant="determinate"
                  value={run.progress_pct}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {run.progress_pct}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Attempt {run.attempt}/{run.max_attempts}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Queue metrics */}
      {metrics?.queues && metrics.queues.length > 0 && (
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider', p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            Queue Depths
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
            {metrics.queues.map((q) => (
              <Box key={q.queue_name} sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">{q.queue_name}</Typography>
                <Typography variant="h6" fontWeight={700}>{q.queue_length}</Typography>
                {q.oldest_msg_age_sec != null && (
                  <Typography variant="caption" color="text.secondary">
                    Oldest: {formatDuration(q.oldest_msg_age_sec * 1000)}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Runs Tab ────────────────────────────────────────────────────────────────────

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Filter */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => onStatusFilterChange(e.target.value as WorkflowRunStatus | 'all')}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="running">Running</MenuItem>
            <MenuItem value="queued">Queued</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
            <MenuItem value="dead_letter">Dead Letter</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          {runs.length} run{runs.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Table */}
      <TableContainer sx={{ bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell sx={{ fontWeight: 700 }}>Workflow</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Queue</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Attempt</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Progress</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.map((run) => (
              <React.Fragment key={run.id}>
                <TableRow
                  hover
                  sx={{ cursor: 'pointer', '& > *': { borderBottom: expandedRow === run.id ? 'none' : undefined } }}
                  onClick={() => setExpandedRow(expandedRow === run.id ? null : run.id)}
                >
                  <TableCell sx={{ width: 32, p: 0.5 }}>
                    {expandedRow === run.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{run.workflow_name}</Typography>
                  </TableCell>
                  <TableCell><StatusChip status={run.status} /></TableCell>
                  <TableCell>
                    <Chip size="small" label={run.queue_name} variant="outlined" sx={{ fontSize: '0.7rem' }} />
                  </TableCell>
                  <TableCell>{run.attempt}/{run.max_attempts}</TableCell>
                  <TableCell>
                    {run.items_total > 0 ? (
                      <Typography variant="caption">
                        {run.items_processed}/{run.items_total} ({run.progress_pct}%)
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatDuration(run.duration_ms)}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                    </Typography>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {(run.status === 'failed' || run.status === 'dead_letter') && (
                        <Tooltip title="Retry">
                          <IconButton size="small" onClick={() => onRetry(run.id)}>
                            <RotateCcw size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {run.status === 'queued' && (
                        <Tooltip title="Cancel">
                          <IconButton size="small" onClick={() => onCancel(run.id)}>
                            <XCircle size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
                {expandedRow === run.id && (
                  <TableRow>
                    <TableCell colSpan={9} sx={{ bgcolor: 'action.hover', py: 2 }}>
                      <RunDetail run={run} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No runs found</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ── Run Detail (expanded row) ───────────────────────────────────────────────────

function RunDetail({ run }: { run: WorkflowRun }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, fontSize: '0.8rem' }}>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>ID</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{run.id}</Typography>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>Triggered By</Typography>
        <Typography variant="body2">{run.triggered_by}</Typography>
      </Box>
      {run.error_message && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Typography variant="caption" color="error" fontWeight={700}>Error</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'error.main', whiteSpace: 'pre-wrap' }}>
            {run.error_message}
          </Typography>
        </Box>
      )}
      {run.output_result && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>Output</Typography>
          <Box
            component="pre"
            sx={{
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              p: 1,
              borderRadius: 1,
              bgcolor: 'background.default',
              overflow: 'auto',
              maxHeight: 200,
            }}
          >
            {JSON.stringify(run.output_result, null, 2)}
          </Box>
        </Box>
      )}
      {run.input_payload && Object.keys(run.input_payload).length > 0 && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>Input Payload</Typography>
          <Box
            component="pre"
            sx={{
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              p: 1,
              borderRadius: 1,
              bgcolor: 'background.default',
              overflow: 'auto',
              maxHeight: 150,
            }}
          >
            {JSON.stringify(run.input_payload, null, 2)}
          </Box>
        </Box>
      )}
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>Timing</Typography>
        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
          Queued: {format(new Date(run.queued_at), 'HH:mm:ss')}
          {run.started_at && ` · Started: ${format(new Date(run.started_at), 'HH:mm:ss')}`}
          {run.completed_at && ` · Done: ${format(new Date(run.completed_at), 'HH:mm:ss')}`}
        </Typography>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>Items</Typography>
        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
          Total: {run.items_total} · Processed: {run.items_processed} · Succeeded: {run.items_succeeded} · Failed: {run.items_failed}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Definitions Tab ─────────────────────────────────────────────────────────────

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
    <TableContainer sx={{ bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Edge Function</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Queue</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Schedule</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Priority</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Retries</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Concurrency</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Enabled</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {definitions.map((def) => (
            <TableRow key={def.id} hover>
              <TableCell>
                <Typography variant="body2" fontWeight={600}>{def.name}</Typography>
              </TableCell>
              <TableCell>
                <Chip size="small" label={def.edge_function} variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} />
              </TableCell>
              <TableCell>
                <Chip size="small" label={def.queue_name} sx={{ fontSize: '0.7rem' }} />
              </TableCell>
              <TableCell>
                {def.schedule ? (
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{def.schedule}</Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary">Manual</Typography>
                )}
              </TableCell>
              <TableCell>{def.priority}</TableCell>
              <TableCell>{def.max_retries}</TableCell>
              <TableCell>{def.max_concurrency}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={def.is_enabled ? 'Yes' : 'No'}
                  color={def.is_enabled ? 'success' : 'default'}
                  sx={{ fontSize: '0.7rem' }}
                />
              </TableCell>
              <TableCell>
                <Tooltip title={`Enqueue ${def.name}`}>
                  <IconButton
                    size="small"
                    disabled={!def.is_enabled || isEnqueuing}
                    onClick={() => onEnqueue({ workflow: def.name })}
                  >
                    <Play size={14} />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── Dead Letter Tab ─────────────────────────────────────────────────────────────

function DeadLetterTab({
  runs,
  onRetry,
}: {
  runs: WorkflowRun[];
  onRetry: (id: string) => Promise<unknown>;
}) {
  if (runs.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Heart size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
        <Typography variant="h6" color="text.secondary">No dead letter messages</Typography>
        <Typography variant="body2" color="text.secondary">All workflows are completing successfully.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, bgcolor: 'error.main', borderRadius: 2, color: 'error.contrastText' }}>
        <AlertTriangle size={18} />
        <Typography variant="body2" fontWeight={600}>
          {runs.length} workflow{runs.length !== 1 ? 's' : ''} in dead letter queue — review and retry or discard.
        </Typography>
      </Box>
      {runs.map((run) => (
        <Box
          key={run.id}
          sx={{ bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'error.light', p: 2 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>{run.workflow_name}</Typography>
              <StatusChip status={run.status} />
            </Box>
            <Button variant="outline" size="sm" onClick={() => onRetry(run.id)}>
              <RotateCcw size={14} />
              Retry
            </Button>
          </Box>
          {run.error_message && (
            <Typography variant="body2" color="error.main" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 1 }}>
              {run.error_message}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Attempt {run.attempt}/{run.max_attempts} · {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// ── Enqueue Dialog ──────────────────────────────────────────────────────────────

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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Enqueue Workflow</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <FormControl fullWidth>
          <InputLabel>Workflow</InputLabel>
          <Select
            value={selectedWorkflow}
            label="Workflow"
            onChange={(e) => setSelectedWorkflow(e.target.value)}
          >
            {definitions
              .filter((d) => d.is_enabled)
              .map((d) => (
                <MenuItem key={d.id} value={d.name}>
                  {d.name} ({d.queue_name})
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <TextField
          label="Payload (JSON)"
          multiline
          rows={4}
          value={payloadStr}
          onChange={(e) => {
            setPayloadStr(e.target.value);
            setPayloadError('');
          }}
          error={!!payloadError}
          helperText={payloadError}
          sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8rem' } }}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleEnqueue} disabled={!selectedWorkflow || isEnqueuing}>
          {isEnqueuing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Enqueue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
