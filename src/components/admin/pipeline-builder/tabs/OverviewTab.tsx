import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Activity, AlertTriangle, CheckCircle, Play, Workflow, GitBranch, Search, Zap, Loader2 } from 'lucide-react';
import { useUnifiedPipelineOverview, usePipelineRunCounts24h, useCircuitBreakers, type UnifiedPipelineRow } from '../hooks/usePipelineHistory';

type Filter = 'all' | 'pipelines' | 'workflows' | 'failing' | 'disabled';

const statusClass: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  failed: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  cancelled: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  paused: 'bg-purple-100 text-purple-700',
};

function humanSchedule(cron: string | null): string {
  if (!cron) return 'Manual';
  const map: Record<string, string> = {
    '0 * * * *': 'Hourly',
    '*/5 * * * *': 'Every 5 min',
    '*/10 * * * *': 'Every 10 min',
    '0 */6 * * *': 'Every 6 hours',
    '0 2 * * *': 'Daily @ 02:00',
    '0 3 * * *': 'Daily @ 03:00',
    '0 4 * * *': 'Daily @ 04:00',
    '0 5 * * *': 'Daily @ 05:00',
    '0 6 * * *': 'Daily @ 06:00',
    '0 8 * * *': 'Daily @ 08:00',
    '30 * * * *': 'Hourly :30',
  };
  return map[cron] || cron;
}

function StatusDots({ statuses }: { statuses: string[] }) {
  const cells = Array.from({ length: 10 }, (_, i) => statuses[i]);
  return (
    <div className="flex gap-[2px]">
      {cells.map((s, i) => {
        const bg = s === 'completed' ? 'bg-green-500'
                 : s === 'failed' ? 'bg-destructive'
                 : s === 'running' ? 'bg-blue-500'
                 : s ? 'bg-muted-foreground' : 'bg-muted';
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div className={`w-[8px] h-[14px] rounded-sm ${bg}`} />
            </TooltipTrigger>
            <TooltipContent className="text-xs">{s || 'no run'}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function StatCard({ icon: Icon, color, value, label, alert }: {
  icon: React.ComponentType<{ className?: string }>; color: string; value: React.ReactNode; label: string; alert?: boolean;
}) {
  return (
    <div className="border border-border rounded-md bg-background p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className={`text-2xl font-bold tabular-nums ${alert ? 'text-destructive' : ''}`}>{value}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default function OverviewTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows, isLoading } = useUnifiedPipelineOverview();
  const { data: counts24h } = usePipelineRunCounts24h();
  const { data: circuitBreakers } = useCircuitBreakers();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const openCircuits = circuitBreakers?.filter(cb => cb.state === 'open').length || 0;
  const activeCount = rows?.filter(r => r.is_enabled && !r.is_template).length || 0;
  const failingCount = rows?.filter(r => r.last_run_status === 'failed').length || 0;
  const pipelineCount = rows?.filter(r => r.kind === 'pipeline').length || 0;
  const workflowCount = rows?.filter(r => r.kind === 'workflow').length || 0;

  const toggleEnabled = useMutation({
    mutationFn: async ({ row, enabled }: { row: UnifiedPipelineRow; enabled: boolean }) => {
      const table = row.kind === 'pipeline' ? 'pipeline_definitions' : 'workflow_definitions';
      const { error } = await untypedFrom(table).update({ is_enabled: enabled }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unified-pipeline-overview'] }),
    onError: (e: Error) => toast({ title: 'Toggle failed', description: e.message, variant: 'destructive' }),
  });

  const runNow = useMutation({
    mutationFn: async (row: UnifiedPipelineRow) => {
      if (row.kind === 'pipeline') {
        const { error } = await supabase.functions.invoke('pipeline-executor', {
          body: { pipeline_id: row.id, triggered_by: 'manual-overview' },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.functions.invoke('workflow-dispatcher', {
          body: { workflow_name: row.name, triggered_by: 'manual-overview' },
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, row) => {
      toast({ title: `Started: ${row.display_name || row.name}` });
      setTimeout(() => qc.invalidateQueries({ queryKey: ['unified-pipeline-overview'] }), 1500);
    },
    onError: (e: Error) => toast({ title: 'Run failed', description: e.message, variant: 'destructive' }),
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter(r => {
      if (filter === 'pipelines' && r.kind !== 'pipeline') return false;
      if (filter === 'workflows' && r.kind !== 'workflow') return false;
      if (filter === 'failing' && r.last_run_status !== 'failed') return false;
      if (filter === 'disabled' && r.is_enabled) return false;
      if (search && !`${r.name} ${r.display_name || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, filter, search]);

  const openRow = (row: UnifiedPipelineRow) => {
    if (row.kind === 'pipeline') navigate(`/admin/pipelines?pipeline=${row.name}`);
    else navigate(`/admin/pipelines?tab=monitor&workflow=${row.name}`);
  };

  const FilterButton = ({ value, label, count }: { value: Filter; label: string; count?: number }) => (
    <button
      onClick={() => setFilter(value)}
      className={`text-xs px-3 py-1 rounded border transition-colors capitalize ${
        filter === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-accent'
      }`}
    >
      {label}
      {count != null && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Activity} color="text-primary" value={activeCount} label="Active definitions" />
          <StatCard icon={CheckCircle} color="text-green-600 dark:text-green-400" value={counts24h?.total ?? '—'} label="Runs in last 24h" />
          <StatCard
            icon={AlertTriangle}
            color={failingCount > 0 ? 'text-destructive' : 'text-muted-foreground'}
            value={failingCount}
            label="Currently failing"
            alert={failingCount > 0}
          />
          <StatCard
            icon={AlertTriangle}
            color={openCircuits > 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}
            value={openCircuits}
            label="Open circuits"
            alert={openCircuits > 0}
          />
        </div>

        {/* Filter + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterButton value="all" label="all" count={rows?.length} />
          <FilterButton value="pipelines" label="pipelines" count={pipelineCount} />
          <FilterButton value="workflows" label="workflows" count={workflowCount} />
          <FilterButton value="failing" label="failing" count={failingCount} />
          <FilterButton value="disabled" label="disabled" />
          <div className="relative ml-auto w-60">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-md bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[90px]">Kind</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[130px]">Schedule</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[110px]">Last run</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[100px]">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[160px]">Last 10</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[110px]">Items</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[80px]">Enabled</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[100px]" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">
                  {rows?.length === 0 ? 'No definitions yet' : 'No matches'}
                </td></tr>
              ) : filtered.map(row => (
                <tr key={`${row.kind}-${row.id}`} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 align-top">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                      {row.kind === 'pipeline' ? <GitBranch className="h-2.5 w-2.5" /> : <Workflow className="h-2.5 w-2.5" />}
                      {row.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <button
                      onClick={() => openRow(row)}
                      className="text-primary font-medium hover:underline text-left"
                    >
                      {row.display_name || row.name}
                    </button>
                    {row.is_template && <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">Template</Badge>}
                    <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[320px]" title={row.name}>{row.name}</div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground"
                      title={row.schedule || 'manual'}>
                    {humanSchedule(row.schedule)}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground"
                      title={row.last_run_at ? new Date(row.last_run_at).toISOString() : ''}>
                    {row.last_run_at ? formatDistanceToNow(new Date(row.last_run_at), { addSuffix: true }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {row.last_run_status ? (
                      <Badge variant="outline" className={`text-[10px] px-2 py-0 ${statusClass[row.last_run_status] || ''}`}>
                        {row.last_run_status}
                      </Badge>
                    ) : <span className="text-[11px] text-muted-foreground">never</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex flex-col gap-1">
                      <StatusDots statuses={row.recent_statuses} />
                      <span className="text-[10px] text-muted-foreground">
                        {row.recent_total_count > 0 ? `${row.recent_success_count}/${row.recent_total_count} ok` : 'no runs'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs tabular-nums">
                    {row.last_items_total != null && row.last_items_total > 0
                      ? <><span className="text-green-700 dark:text-green-300 font-semibold">{row.last_items_succeeded ?? 0}</span><span className="text-muted-foreground">/{row.last_items_total}</span></>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Switch
                      checked={row.is_enabled}
                      onCheckedChange={enabled => toggleEnabled.mutate({ row, enabled })}
                    />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={runNow.isPending || !row.is_enabled}
                      onClick={() => runNow.mutate(row)}
                    >
                      {runNow.isPending && runNow.variables?.id === row.id
                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        : <Play className="h-3 w-3 mr-1" />}
                      Run
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && rows && (
            <div className="px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
              Showing {filtered.length} of {rows.length} definitions
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
