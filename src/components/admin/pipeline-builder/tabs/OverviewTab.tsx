import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, AlertTriangle, CheckCircle, Play, Workflow, GitBranch, Search, Zap } from 'lucide-react';
import { useUnifiedPipelineOverview, usePipelineRunCounts24h, useCircuitBreakers, type UnifiedPipelineRow } from '../hooks/usePipelineHistory';

type Filter = 'all' | 'pipelines' | 'workflows' | 'failing' | 'disabled';

const statusColors: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-yellow-100 text-yellow-700',
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

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StatusDots({ statuses }: { statuses: string[] }) {
  const cells = Array.from({ length: 10 }, (_, i) => statuses[i]);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {cells.map((s, i) => {
        const bg = s === 'completed' ? '#22c55e' : s === 'failed' ? '#ef4444' : s === 'running' ? '#3b82f6' : s ? '#9ca3af' : '#e5e7eb';
        return <div key={i} style={{ width: 8, height: 14, background: bg, borderRadius: 1 }} title={s || 'no run'} />;
      })}
    </div>
  );
}

export default function OverviewTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: rows, isLoading } = useUnifiedPipelineOverview();
  const { data: counts24h } = usePipelineRunCounts24h();
  const { data: circuitBreakers } = useCircuitBreakers();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const openCircuits = circuitBreakers?.filter(cb => cb.state === 'open').length || 0;
  const activeCount = rows?.filter(r => r.is_enabled && !r.is_template).length || 0;
  const failingCount = rows?.filter(r => r.last_run_status === 'failed').length || 0;

  const toggleEnabled = useMutation({
    mutationFn: async ({ row, enabled }: { row: UnifiedPipelineRow; enabled: boolean }) => {
      const table = row.kind === 'pipeline' ? 'pipeline_definitions' : 'workflow_definitions';
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const { error } = await sb.from(table).update({ is_enabled: enabled }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unified-pipeline-overview'] }),
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
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['unified-pipeline-overview'] }), 1500),
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

  const statCard: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px', background: '#fff' };
  const statValue: React.CSSProperties = { fontSize: 24, fontWeight: 700 };
  const statLabel: React.CSSProperties = { fontSize: 12, color: '#9ca3af', marginTop: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div style={statCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity style={{ width: 16, height: 16, color: '#6366f1' }} />
            <span style={statValue}>{activeCount}</span>
          </div>
          <div style={statLabel}>Active definitions</div>
        </div>
        <div style={statCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle style={{ width: 16, height: 16, color: '#22c55e' }} />
            <span style={statValue}>{counts24h?.total ?? '—'}</span>
          </div>
          <div style={statLabel}>Runs in last 24h</div>
        </div>
        <div style={statCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle style={{ width: 16, height: 16, color: failingCount > 0 ? '#ef4444' : '#9ca3af' }} />
            <span style={{ ...statValue, color: failingCount > 0 ? '#ef4444' : undefined }}>{failingCount}</span>
          </div>
          <div style={statLabel}>Currently failing</div>
        </div>
        <div style={statCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle style={{ width: 16, height: 16, color: openCircuits > 0 ? '#ef4444' : '#22c55e' }} />
            <span style={{ ...statValue, color: openCircuits > 0 ? '#ef4444' : undefined }}>{openCircuits}</span>
          </div>
          <div style={statLabel}>Open circuits</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['all', 'pipelines', 'workflows', 'failing', 'disabled'] as Filter[]).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
            style={{ textTransform: 'capitalize' }}
          >
            {f}
            {f === 'all' && rows && <span style={{ marginLeft: 6, opacity: 0.7 }}>{rows.length}</span>}
            {f === 'pipelines' && rows && <span style={{ marginLeft: 6, opacity: 0.7 }}>{rows.filter(r => r.kind === 'pipeline').length}</span>}
            {f === 'workflows' && rows && <span style={{ marginLeft: 6, opacity: 0.7 }}>{rows.filter(r => r.kind === 'workflow').length}</span>}
            {f === 'failing' && <span style={{ marginLeft: 6, opacity: 0.7 }}>{failingCount}</span>}
          </Button>
        ))}
        <div style={{ position: 'relative', marginLeft: 'auto', width: 260 }}>
          <Search style={{ position: 'absolute', left: 8, top: 9, width: 14, height: 14, color: '#9ca3af' }} />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 28 }}
          />
        </div>
      </div>

      <Card>
        <CardContent style={{ padding: 0 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 90 }}>Kind</TableHead>
                <TableHead>Name</TableHead>
                <TableHead style={{ width: 130 }}>Schedule</TableHead>
                <TableHead style={{ width: 110 }}>Last Run</TableHead>
                <TableHead style={{ width: 100 }}>Status</TableHead>
                <TableHead style={{ width: 160 }}>Last 10</TableHead>
                <TableHead style={{ width: 110 }}>Items</TableHead>
                <TableHead style={{ width: 80 }}>Enabled</TableHead>
                <TableHead style={{ width: 140 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No matches</TableCell></TableRow>
              ) : filtered.map(row => (
                <TableRow key={`${row.kind}-${row.id}`} className="hover:bg-accent/50">
                  <TableCell>
                    <Badge variant="outline" className="text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {row.kind === 'pipeline' ? <GitBranch style={{ width: 11, height: 11 }} /> : <Workflow style={{ width: 11, height: 11 }} />}
                      {row.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => openRow(row)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: '#6366f1', fontWeight: 500 }}
                    >
                      {row.display_name || row.name}
                    </button>
                    {row.is_template && <Badge variant="outline" className="ml-2 text-[10px]">Template</Badge>}
                    <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{row.name}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{humanSchedule(row.schedule)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{relativeTime(row.last_run_at)}</TableCell>
                  <TableCell>
                    {row.last_run_status ? (
                      <Badge variant="outline" className={`text-xs ${statusColors[row.last_run_status] || ''}`}>
                        {row.last_run_status}
                      </Badge>
                    ) : <span className="text-xs text-muted-foreground">never</span>}
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <StatusDots statuses={row.recent_statuses} />
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>
                        {row.recent_total_count > 0 ? `${row.recent_success_count}/${row.recent_total_count} ok` : 'no runs'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.last_items_total != null && row.last_items_total > 0
                      ? `${row.last_items_succeeded ?? 0}/${row.last_items_total}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.is_enabled}
                      onCheckedChange={enabled => toggleEnabled.mutate({ row, enabled })}
                    />
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={runNow.isPending || !row.is_enabled}
                        onClick={() => runNow.mutate(row)}
                      >
                        {runNow.isPending && runNow.variables?.id === row.id ? <Zap className="h-3 w-3 animate-pulse" /> : <Play className="h-3 w-3" />}
                        <span style={{ marginLeft: 4 }}>Run</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
