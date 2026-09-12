import { useState, useMemo } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Trash2, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { fetchDlqRows, retryDlqItem, type DlqRow } from '@/hooks/usePipelineBuilderTabs';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';

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
  pending: 'bg-muted text-foreground',
  retrying: 'bg-muted text-foreground',
  permanent_failed: 'bg-destructive/10 dark:bg-destructive/40 text-destructive',
  resolved: 'bg-muted text-foreground',
};

const summaryColumns: AdminSimpleColumn<SummaryRow>[] = [
  {
    key: 'source',
    header: 'Source',
    cellClassName: 'font-mono text-xs',
    render: (r) => r.source_slug ?? '—',
  },
  { key: 'stage', header: 'Stage', cellClassName: 'font-mono text-xs', render: (r) => r.stage },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (
      <span
        className={`inline-block text-2xs px-2 py-0.5 rounded-full ${statusClass[r.status] || 'bg-muted'}`}
      >
        {r.status}
      </span>
    ),
  },
  {
    key: 'items',
    header: 'Items',
    cellClassName: 'tabular-nums font-semibold',
    render: (r) => r.items,
  },
  {
    key: 'next_retry',
    header: 'Next retry',
    cellClassName: 'text-muted-foreground text-xs',
    render: (r) => (
      <span title={r.next_retry ? new Date(r.next_retry).toISOString() : ''}>
        {r.next_retry ? formatDistanceToNow(new Date(r.next_retry), { addSuffix: true }) : '—'}
      </span>
    ),
  },
];

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
      return (data ?? []) as unknown as SummaryRow[];
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
      const { error } = await supabase.functions.invoke('pipeline-dlq-consumer', {
        body: { limit: 50 },
      });
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

  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, r) => {
          acc.total += r.items;
          if (r.status === 'pending') acc.pending += r.items;
          if (r.status === 'permanent_failed') acc.failed += r.items;
          return acc;
        },
        { total: 0, pending: 0, failed: 0 },
      ),
    [summary],
  );

  const FilterButton = ({ value, label }: { value: StatusFilter; label: string }) => (
    <button
      onClick={() => setFilter(value)}
      className={`text-xs2 px-2.5 py-1 rounded-badge border transition-colors ${
        filter === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-accent'
      }`}
    >
      {label}
    </button>
  );

  const itemColumns: AdminSimpleColumn<DlqRow>[] = [
    {
      key: 'stage',
      header: 'Stage',
      cellClassName: 'font-mono text-xs align-top',
      render: (r) => r.stage,
    },
    {
      key: 'source',
      header: 'Source',
      cellClassName: 'font-mono text-xs align-top',
      render: (r) => r.source_slug ?? '—',
    },
    {
      key: 'error',
      header: 'Error',
      cellClassName: 'align-top max-w-[360px]',
      render: (r) => (
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
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      cellClassName: 'tabular-nums text-xs align-top',
      render: (r) => `${r.attempts}/${r.max_attempts}`,
    },
    {
      key: 'status',
      header: 'Status',
      cellClassName: 'align-top',
      render: (r) => (
        <span
          className={`inline-block text-2xs px-2 py-0.5 rounded-full ${statusClass[r.status] || 'bg-muted'}`}
        >
          {r.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'align-top flex gap-1',
      render: (r) => (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-primary"
                onClick={() => retryNow.mutate(r.id)}
                disabled={retryNow.isPending}
                // Matches the TooltipContent below. A tooltip supplies
                // aria-describedby when open — a description, never a name.
                aria-label="Retry now"
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
                aria-label="Mark resolved"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Mark resolved</TooltipContent>
          </Tooltip>
        </>
      ),
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        {/* Header + controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-foreground" />
          <span className="text-sm font-semibold">Dead Letter Queue</span>
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground">{totals.total}</strong> total ·{' '}
            <strong className="text-foreground">{totals.pending}</strong> pending ·{' '}
            <strong className="text-destructive">{totals.failed}</strong> permanent
          </span>
          <div className="flex-1" />
          {/* eslint-disable-next-line react-hooks/static-components -- component-like reference resolved from a registry/factory; not redefined per render despite the rule's heuristic. */}
          <FilterButton value="pending" label="Pending" />
          {/* eslint-disable-next-line react-hooks/static-components -- component-like reference resolved from a registry/factory; not redefined per render despite the rule's heuristic. */}
          <FilterButton value="permanent_failed" label="Permanent fail" />
          {/* eslint-disable-next-line react-hooks/static-components -- component-like reference resolved from a registry/factory; not redefined per render despite the rule's heuristic. */}
          <FilterButton value="all" label="All" />
          <Button
            size="sm"
            onClick={() => triggerConsumer.mutate()}
            disabled={triggerConsumer.isPending}
            className="h-8 text-xs"
          >
            {triggerConsumer.isPending ? (
              <TrackLoader size={14} className="mr-1.5" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Run consumer now
          </Button>
        </div>

        {/* Summary by source × stage */}
        <div className="rounded-element bg-muted overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground">
            By source × stage
          </div>
          <AdminSimpleTable
            caption="Dead-letter queue by source and stage"
            columns={summaryColumns}
            rows={summary}
            rowKey={(_r, i) => String(i)}
            emptyNoun="DLQ items"
            rowClassName={() => 'border-border/40 hover:bg-muted/30 transition-colors'}
          />
        </div>

        {/* Item drilldown */}
        <AdminSimpleTable
          caption="Dead-letter queue messages"
          className="max-h-[500px] overflow-y-auto"
          columns={itemColumns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          isLoading={isLoading}
          emptyNoun="queued items"
          rowClassName={() => 'border-border/40 hover:bg-muted/30 transition-colors'}
        />
      </div>
    </TooltipProvider>
  );
}
