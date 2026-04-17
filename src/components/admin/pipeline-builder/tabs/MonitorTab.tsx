import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Play, CheckCircle, XCircle, BarChart3, Database, Search, Clock, Loader2, SkipForward, TrendingUp,
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useUnifiedMonitor, type UnifiedRun } from '../hooks/useUnifiedMonitor';
import {
  useStagingStats, useEventIngestStats,
  useCityIngestStats, useCountryIngestStats,
} from '../hooks/usePipelineHistory';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import RunCompareDialog from '../panels/RunCompareDialog';

type StatusFilter = 'all' | 'running' | 'completed' | 'failed';
type TypeFilter = 'all' | 'pipeline' | 'workflow';

const statusClass: Record<string, string> = {
  running: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  failed: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  dead_letter: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  queued: 'bg-muted text-muted-foreground',
  cancelled: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
};

const statusIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  dead_letter: XCircle,
  queued: Clock,
  cancelled: SkipForward,
};

function formatDuration(ms: number | null | undefined, status?: string): string {
  if (status === 'running') return '…';
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

type Agg = {
  staged: number; validated: number; unique_items: number; duplicates: number;
  merge_candidates: number; inserted: number; committed?: number; updated: number; rejected: number; pending_review: number;
};

function aggregateBySource(rows: Array<{ source: string | null } & Partial<Agg>> | undefined): Array<[string, Agg]> {
  const acc: Record<string, Agg> = {};
  for (const row of rows || []) {
    const src = row.source || 'unknown';
    if (!acc[src]) acc[src] = { staged: 0, validated: 0, unique_items: 0, duplicates: 0, merge_candidates: 0, inserted: 0, updated: 0, rejected: 0, pending_review: 0 };
    acc[src].staged           += Number(row.staged || 0);
    acc[src].validated        += Number(row.validated || 0);
    acc[src].unique_items     += Number(row.unique_items || 0);
    acc[src].duplicates       += Number(row.duplicates || 0);
    acc[src].merge_candidates += Number(row.merge_candidates || 0);
    acc[src].inserted         += Number(row.inserted || row.committed || 0);
    acc[src].updated          += Number(row.updated || 0);
    acc[src].rejected         += Number(row.rejected || 0);
    acc[src].pending_review   += Number(row.pending_review || 0);
  }
  return Object.entries(acc).sort((a, b) => b[1].staged - a[1].staged);
}

function totalsFor(sources: Array<[string, Agg]>) {
  return sources.reduce(
    (t, [, v]) => ({
      staged: t.staged + v.staged,
      inserted: t.inserted + v.inserted,
      rejected: t.rejected + v.rejected,
      pending_review: t.pending_review + v.pending_review,
    }),
    { staged: 0, inserted: 0, rejected: 0, pending_review: 0 }
  );
}

function StatCard({ icon: Icon, color, value, label }: { icon: React.ComponentType<{ className?: string }>; color: string; value: number | string; label: string }) {
  return (
    <div className="border border-border rounded-md bg-background px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function IngestTable({ label, sources, totals }: { label: string; sources: Array<[string, Agg]>; totals: ReturnType<typeof totalsFor> }) {
  return (
    <div className="border border-border rounded-md bg-background overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="font-semibold text-sm">{label} Ingest</div>
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span>staged <span className="font-semibold text-foreground">{totals.staged}</span></span>
          <span>·</span>
          <span>committed <span className="font-semibold text-green-700 dark:text-green-300">{totals.inserted}</span></span>
          <span>·</span>
          <span>review <span className="font-semibold text-amber-700 dark:text-amber-300">{totals.pending_review}</span></span>
          <span>·</span>
          <span>rejected <span className="font-semibold text-destructive">{totals.rejected}</span></span>
          <span className="ml-2 text-[10px]">last 14d</span>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 sticky top-0">
            <tr className="border-b border-border">
              {['Source', 'Staged', 'Validated', 'Unique', 'Dupe', 'Merge?', 'Committed', 'Updated', 'Review', 'Rejected'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 ? (
              <tr><td colSpan={10} className="p-5 text-center text-muted-foreground text-xs">No {label.toLowerCase()} ingest activity</td></tr>
            ) : sources.map(([src, v]) => (
              <tr key={src} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-medium">{src}</td>
                <td className="px-3 py-2 tabular-nums">{v.staged}</td>
                <td className="px-3 py-2 tabular-nums">{v.validated}</td>
                <td className="px-3 py-2 tabular-nums">{v.unique_items}</td>
                <td className={`px-3 py-2 tabular-nums ${v.duplicates ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{v.duplicates}</td>
                <td className={`px-3 py-2 tabular-nums ${v.merge_candidates ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{v.merge_candidates}</td>
                <td className={`px-3 py-2 tabular-nums ${v.inserted ? 'text-green-700 dark:text-green-300 font-semibold' : 'text-muted-foreground'}`}>{v.inserted}</td>
                <td className="px-3 py-2 tabular-nums">{v.updated}</td>
                <td className={`px-3 py-2 tabular-nums ${v.pending_review ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{v.pending_review}</td>
                <td className={`px-3 py-2 tabular-nums ${v.rejected ? 'text-destructive' : 'text-muted-foreground'}`}>{v.rejected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MonitorTab() {
  const { allRuns, stats, isLoading } = useUnifiedMonitor();
  const { data: stagingStats } = useStagingStats();
  const { data: eventStats } = useEventIngestStats(14);
  const { data: cityStats } = useCityIngestStats(14);
  const { data: countryStats } = useCountryIngestStats(14);
  const [selectedRun, setSelectedRun] = useState<UnifiedRun | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const totalStaging = stagingStats?.reduce((sum, s) => sum + s.count, 0) || 0;

  // Duration histogram: bucket completed runs by duration
  const durationHistogram = useMemo(() => {
    const buckets = [
      { range: '<1s', min: 0, max: 1000, count: 0 },
      { range: '1–5s', min: 1000, max: 5000, count: 0 },
      { range: '5–15s', min: 5000, max: 15_000, count: 0 },
      { range: '15–60s', min: 15_000, max: 60_000, count: 0 },
      { range: '1–5m', min: 60_000, max: 5 * 60_000, count: 0 },
      { range: '>5m', min: 5 * 60_000, max: Infinity, count: 0 },
    ];
    for (const r of allRuns) {
      if (r.status !== 'completed' || !r.duration_ms || r.duration_ms <= 0) continue;
      for (const b of buckets) {
        if (r.duration_ms >= b.min && r.duration_ms < b.max) { b.count++; break; }
      }
    }
    return buckets;
  }, [allRuns]);

  // Throughput over time: runs per hour for last 24h
  const throughputData = useMemo(() => {
    const now = Date.now();
    const hours: Array<{ hour: string; completed: number; failed: number }> = [];
    for (let i = 23; i >= 0; i--) {
      const start = now - (i + 1) * 60 * 60 * 1000;
      const end = now - i * 60 * 60 * 1000;
      const hour = new Date(end).getHours();
      let completed = 0, failed = 0;
      for (const r of allRuns) {
        const t = r.started_at ? new Date(r.started_at).getTime() : 0;
        if (t < start || t > end) continue;
        if (r.status === 'completed') completed++;
        else if (r.status === 'failed' || r.status === 'dead_letter') failed++;
      }
      hours.push({ hour: `${hour}h`, completed, failed });
    }
    return hours;
  }, [allRuns]);

  const filteredRuns = useMemo(() => {
    return allRuns.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter === 'failed' && !['failed', 'dead_letter'].includes(r.status)) return false;
      if (statusFilter === 'completed' && r.status !== 'completed') return false;
      if (statusFilter === 'running' && r.status !== 'running') return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.name.toLowerCase().includes(q)
            && !(r.error_message || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allRuns, search, statusFilter, typeFilter]);

  const eventSources   = aggregateBySource(eventStats);
  const citySources    = aggregateBySource(cityStats);
  const countrySources = aggregateBySource(countryStats);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard icon={Play} color="text-blue-600 dark:text-blue-400" value={stats.running} label="Running" />
          <StatCard icon={CheckCircle} color="text-green-600 dark:text-green-400" value={stats.completed} label="Completed" />
          <StatCard icon={XCircle} color="text-destructive" value={stats.failed} label="Failed" />
          <StatCard icon={Database} color="text-indigo-600" value={totalStaging} label="Staging Items" />
          <StatCard icon={BarChart3} color="text-amber-600 dark:text-amber-400" value={stats.total} label="Total Runs" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="border border-border rounded-md bg-background overflow-hidden">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Run duration distribution
            </div>
            <div className="p-3" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={durationHistogram} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <ChartTooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }}
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-border rounded-md bg-background overflow-hidden">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Throughput (last 24h)
            </div>
            <div className="p-3" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={throughputData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <ChartTooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="completed" stroke="rgb(22 163 74)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Per-entity ingest tables */}
        <IngestTable label="Event" sources={eventSources} totals={totalsFor(eventSources)} />
        <IngestTable label="City" sources={citySources} totals={totalsFor(citySources)} />
        <IngestTable label="Country" sources={countrySources} totals={totalsFor(countrySources)} />

        {/* Runs table + detail panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Runs table */}
          <div className="lg:col-span-2 border border-border rounded-md bg-background overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <div className="font-semibold text-sm mr-2">Recent Runs</div>
              <RunCompareDialog />
              <div className="relative flex-1 max-w-xs">
                <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or error..."
                  className="h-7 pl-6 text-xs"
                />
              </div>
              <div className="flex gap-1">
                {(['all', 'running', 'completed', 'failed'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      statusFilter === f
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    }`}
                  >{f}</button>
                ))}
              </div>
              <div className="h-4 w-px bg-border mx-1" />
              <div className="flex gap-1">
                {(['all', 'pipeline', 'workflow'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      typeFilter === f
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    }`}
                  >{f}</button>
                ))}
              </div>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="border-b border-border">
                    {['Name', 'Type', 'Status', 'Items', 'Duration', 'Started'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">Loading...</td></tr>
                  ) : filteredRuns.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">
                      {allRuns.length === 0 ? 'No runs yet' : 'No runs match filters'}
                    </td></tr>
                  ) : filteredRuns.map(run => {
                    const Icon = statusIcon[run.status] || Clock;
                    return (
                      <tr
                        key={run.id}
                        onClick={() => setSelectedRun(run)}
                        className={`border-b border-border/40 cursor-pointer transition-colors ${
                          selectedRun?.id === run.id ? 'bg-primary/10' : 'hover:bg-muted/30'
                        }`}
                      >
                        <td className="px-3 py-2 font-medium truncate max-w-[200px]" title={run.name}>{run.name}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {run.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusClass[run.status] || 'bg-muted'}`}>
                            <Icon className={`h-2.5 w-2.5 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                            {run.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-xs">
                          <span className="text-green-700 dark:text-green-300 font-semibold">{run.items_succeeded}</span>
                          <span className="text-muted-foreground">/{run.items_processed}</span>
                          {run.items_failed > 0 && <span className="text-destructive ml-1">·{run.items_failed}</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono tabular-nums text-xs">
                          {formatDuration(run.duration_ms, run.status)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs" title={run.started_at ? new Date(run.started_at).toISOString() : ''}>
                          {run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!isLoading && (
              <div className="px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
                Showing {filteredRuns.length} of {allRuns.length} runs
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="border border-border rounded-md bg-background overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-border font-semibold text-sm">
              {selectedRun ? 'Run Details' : 'Select a run'}
            </div>
            <div className="p-3 max-h-[500px] overflow-y-auto">
              {selectedRun ? (
                <div className="flex flex-col gap-2">
                  <div>
                    <div className="font-semibold text-sm truncate">{selectedRun.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 mr-1">{selectedRun.type}</Badge>
                      {selectedRun.id.slice(0, 8)}
                    </div>
                  </div>
                  {selectedRun.error_message && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      {selectedRun.error_message}
                    </div>
                  )}
                  {selectedRun.node_states && Object.entries(selectedRun.node_states as Record<string, Record<string, unknown>>).map(([nodeId, state]) => {
                    const NodeIcon = statusIcon[state.status as string] || Clock;
                    return (
                      <div key={nodeId} className="border border-border rounded-md p-2 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono truncate" title={nodeId}>{nodeId}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0 rounded ${statusClass[state.status as string] || 'bg-muted'}`}>
                            <NodeIcon className={`h-2.5 w-2.5 ${state.status === 'running' ? 'animate-spin' : ''}`} />
                            {state.status as string}
                          </span>
                        </div>
                        {(state.items_out as number) > 0 && (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {state.items_out as number} items out
                            {state.duration_ms ? ` · ${formatDuration(state.duration_ms as number)}` : ''}
                          </div>
                        )}
                        {state.error != null && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-[11px] text-destructive mt-1 truncate cursor-help">{state.error as string}</div>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs max-w-[320px] whitespace-pre-wrap">{state.error as string}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                  {selectedRun.output_result && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1">Raw output</summary>
                      <pre className="text-[10px] bg-muted/40 p-2 rounded-md overflow-auto max-h-56 mt-1">
                        {JSON.stringify(selectedRun.output_result, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-8">Click a run to view details</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
