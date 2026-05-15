import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Trash2, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  fetchDlqRows,
  retryDlqItem,
  type DlqRow,
} from '@/hooks/usePipelineBuilderTabs';

interface SummaryRow {
  source_slug: string | null;
  stage: string;
  status: string;
  items: number;
  next_retry: string | null;
  last_attempt: string | null;
}

type StatusFilter = 'pending' | 'permanent_failed' | 'all';

const statusClass: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  retrying: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  permanent_failed: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  resolved: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
};

export default function DLQTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>('pending');

  const { data: summary = [] } = useQuery<SummaryRow[]>({
    queryKey: ['dlq-summary'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('dlq_summary').select('*');
      if (error) {
        console.warn('dlq_summary view unavailable:', error.message);
        return [];
      }
      return (data ?? []) as SummaryRow[];
    },
    refetchInterval: 15_000,
  });

  const { data: rows = [], isLoading } = useQuery<DlqRow[]>({
    queryKey: ['dlq-rows', filter],
    queryFn: () => fetchDlqRows(filter),
    refetchInterval: 15_000,
  });

  const triggerConsumer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('pipeline-dlq-consumer', { body: { limit: 50 } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('DLQ consumer triggered: Processing up to 50 items');
      qc.invalidateQueries({ queryKey: ['dlq-rows'] });
    },
    onError: (e: Error) => toast.error(`DLQ consumer failed: ${e.message}`),
  });

  const retryNow = useMutation({
    mutationFn: (id: number) => retryDlqItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dlq-rows'] }),
    onError: (e: Error) => toast.error(`Retry failed: ${e.message}`),
  });

  const resolveItem = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc('dlq_resolve', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dlq-rows'] }),
    onError: (e: Error) => toast.error(`Resolve failed: ${e.message}`),
  });

  const totals = useMemo(() => summary.reduce(
    (acc, r) => {
      acc.total += r.items;
      if (r.status === 'pending') acc.pending += r.items;
      if (r.status === 'permanent_failed') acc.failed += r.items;
      return acc;
    }, { total: 0, pending: 0, failed: 0 }
  ), [summary]);

  const FilterButton = ({ value, label }: { value: StatusFilter; label: string }) => (
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
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        {/* Header + controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-semibold">Dead Letter Queue</span>
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground">{totals.total}</strong> total · <strong className="text-yellow-700 dark:text-yellow-300">{totals.pending}</strong> pending · <strong className="text-destructive">{totals.failed}</strong> permanent
          </span>
          <div className="flex-1" />
          <FilterButton value="pending" label="Pending" />
          <FilterButton value="permanent_failed" label="Permanent fail" />
          <FilterButton value="all" label="All" />
          <Button
            size="sm"
            onClick={() => triggerConsumer.mutate()}
            disabled={triggerConsumer.isPending}
            className="h-8 text-xs"
          >
            {triggerConsumer.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Run consumer now
          </Button>
        </div>

        {/* Summary by source × stage */}
        <div className="border border-border rounded-element bg-background overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground">
            By source × stage
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                {['Source', 'Stage', 'Status', 'Items', 'Next retry'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">DLQ is empty</td></tr>
              ) : summary.map((r, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">{r.source_slug ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.stage}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-2xs px-2 py-0.5 rounded-full ${statusClass[r.status] || 'bg-muted'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums font-semibold">{r.items}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs"
                      title={r.next_retry ? new Date(r.next_retry).toISOString() : ''}>
                    {r.next_retry ? formatDistanceToNow(new Date(r.next_retry), { addSuffix: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Item drilldown */}
        <div className="border border-border rounded-element bg-background overflow-hidden max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="border-b border-border">
                {['Stage', 'Source', 'Error', 'Attempts', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">Nothing in queue</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs align-top">{r.stage}</td>
                  <td className="px-3 py-2 font-mono text-xs align-top">{r.source_slug ?? '—'}</td>
                  <td className="px-3 py-2 align-top max-w-[360px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="font-mono text-xs2 text-destructive truncate cursor-help">
                          {r.error_code && <strong>{r.error_code}: </strong>}
                          {r.error_message ?? '—'}
                        </div>
                      </TooltipTrigger>
                      {r.error_message && (
                        <TooltipContent className="text-xs max-w-[480px] whitespace-pre-wrap">
                          {r.error_message}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs align-top">
                    {r.attempts}/{r.max_attempts}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-block text-2xs px-2 py-0.5 rounded-full ${statusClass[r.status] || 'bg-muted'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-primary"
                          onClick={() => retryNow.mutate(r.id)}
                          disabled={retryNow.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Retry now</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (window.confirm('Mark this DLQ item as resolved? It will no longer retry.')) {
                              resolveItem.mutate(r.id);
                            }
                          }}
                          disabled={resolveItem.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Mark resolved</TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
