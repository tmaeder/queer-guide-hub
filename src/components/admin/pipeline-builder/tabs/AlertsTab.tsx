import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  fetchDataOpsAlerts,
  ackDataOpsAlert,
  type DataOpsAlert as Alert,
} from '@/hooks/usePipelineBuilderTabs';

type Filter = 'open' | 'all';

const severityClass: Record<string, string> = {
  info: 'bg-muted dark:bg-foreground/40 text-foreground dark:text-foreground',
  warn: 'bg-muted dark:bg-foreground/40 text-foreground dark:text-foreground',
  error: 'bg-destructive/10 dark:bg-destructive/40 text-destructive dark:text-destructive',
};

const KIND_LABEL: Record<string, string> = {
  coverage_gap: 'Coverage gap',
  dedup_precision_drift: 'Dedup precision drift',
  dlq_backlog: 'DLQ backlog',
};

export default function AlertsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('open');

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['data-ops-alerts', filter],
    queryFn: () => fetchDataOpsAlerts(filter),
    refetchInterval: 30_000,
  });

  const ack = useMutation({
    mutationFn: async (id: number) => {
      const { data: u } = await supabase.auth.getUser();
      await ackDataOpsAlert(id, u.user?.id ?? null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-ops-alerts'] }),
    onError: (e: Error) => toast.error(`Acknowledge failed: ${e.message}`),
  });

  const generateNow = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('generate_data_ops_alerts');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Alert scan complete');
      qc.invalidateQueries({ queryKey: ['data-ops-alerts'] });
    },
    onError: (e: Error) => toast.error(`Alert scan failed: ${e.message}`),
  });

  const counts = useMemo(() => ({
    open: alerts.filter(a => !a.acked_at).length,
    error: alerts.filter(a => !a.acked_at && a.severity === 'error').length,
    warn: alerts.filter(a => !a.acked_at && a.severity === 'warn').length,
    info: alerts.filter(a => !a.acked_at && a.severity === 'info').length,
  }), [alerts]);

  const FilterButton = ({ value, label }: { value: Filter; label: string }) => (
    <button
      onClick={() => setFilter(value)}
      className={`text-xs2 px-2.5 py-1 rounded border transition-colors ${
        filter === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-accent'
      }`}
    >{label}</button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Bell className="h-4 w-4 text-foreground dark:text-foreground" />
        <span className="text-sm font-semibold">Data Ops Alerts</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{counts.open}</strong> open</span>
          {counts.error > 0 && <Badge variant="outline" className="text-2xs px-1.5 py-0 bg-destructive/10 dark:bg-destructive/30 text-destructive dark:text-destructive border-destructive dark:border-destructive">{counts.error} error</Badge>}
          {counts.warn > 0 && <Badge variant="outline" className="text-2xs px-1.5 py-0 bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-border dark:border-border">{counts.warn} warn</Badge>}
          {counts.info > 0 && <Badge variant="outline" className="text-2xs px-1.5 py-0 bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-foreground/40 dark:border-foreground/40">{counts.info} info</Badge>}
        </div>
        <div className="flex-1" />
        {/* eslint-disable-next-line react-hooks/static-components -- component-like reference resolved from a registry/factory; not redefined per render despite the rule's heuristic. */}
        <FilterButton value="open" label={`Open (${counts.open})`} />
        {/* eslint-disable-next-line react-hooks/static-components -- component-like reference resolved from a registry/factory; not redefined per render despite the rule's heuristic. */}
        <FilterButton value="all" label="All" />
        <Button
          size="sm"
          onClick={() => generateNow.mutate()}
          disabled={generateNow.isPending}
          className="h-8 text-xs"
        >
          {generateNow.isPending
            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : <Play className="h-3.5 w-3.5 mr-1.5" />}
          Re-scan
        </Button>
      </div>

      {/* Alerts table */}
      <div className="border border-border rounded-element bg-background overflow-hidden max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 sticky top-0">
            <tr className="border-b border-border">
              {['Kind', 'Severity', 'Source', 'Detail', 'Created', 'Action'].map(h => (
                <th key={h} className="text-left px-4 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
            ) : alerts.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-foreground dark:text-foreground text-sm font-medium">
                <CheckCircle className="h-5 w-5 inline mr-1" />
                All clear
              </td></tr>
            ) : alerts.map(a => (
              <tr key={a.id} className={`border-b border-border/40 hover:bg-muted/30 transition-colors ${a.acked_at ? 'opacity-60' : ''}`}>
                <td className="px-4 py-2.5 align-top font-medium">
                  {KIND_LABEL[a.alert_kind] ?? a.alert_kind}
                </td>
                <td className="px-4 py-2.5 align-top">
                  <span className={`inline-block text-2xs px-2 py-0.5 rounded-full font-medium ${severityClass[a.severity] || 'bg-muted'}`}>
                    {a.severity}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-top font-mono text-xs">
                  {a.source_slug ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 align-top max-w-[380px]">
                  <div className="text-xs2 font-mono space-x-4 break-words">
                    {Object.entries(a.detail).map(([k, v]) => (
                      <span key={k}>
                        <span className="text-muted-foreground">{k}:</span>{' '}
                        <span className="text-foreground">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 align-top text-xs text-muted-foreground"
                    title={new Date(a.created_at).toISOString()}>
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </td>
                <td className="px-4 py-2.5 align-top">
                  {a.acked_at ? (
                    <span className="inline-flex items-center gap-1 text-xs2 text-foreground dark:text-foreground">
                      <CheckCircle className="h-3 w-3" />
                      acked
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary"
                      onClick={() => ack.mutate(a.id)}
                      disabled={ack.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Ack
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
