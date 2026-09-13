import { useMemo } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon, RefreshCw, Hotel, Bed, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  fetchSourceCoverageTargets,
  fetchHotelIngestStats,
  type CoverageTargetRow as CoverageRow,
  type HotelIngestStats as HotelStats,
} from '@/hooks/usePipelineBuilderTabs';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';

const hotelSourceColumns: AdminSimpleColumn<HotelStats>[] = [
  { key: 'source', header: 'Source', cellClassName: 'font-medium', render: (s) => s.source },
  { key: 'staged', header: 'Staged', cellClassName: 'tabular-nums', render: (s) => s.staged },
  {
    key: 'validated',
    header: 'Validated',
    cellClassName: 'tabular-nums',
    render: (s) => s.validated,
  },
  { key: 'unique', header: 'Unique', cellClassName: 'tabular-nums', render: (s) => s.unique_items },
  {
    key: 'dupes',
    header: 'Dupes',
    cellClassName: 'tabular-nums',
    render: (s) => (
      <span className={s.duplicates ? 'text-foreground' : 'text-muted-foreground'}>
        {s.duplicates}
      </span>
    ),
  },
  {
    key: 'committed',
    header: 'Committed',
    cellClassName: 'tabular-nums',
    render: (s) => (
      <span className={s.committed ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
        {s.committed}
      </span>
    ),
  },
  {
    key: 'rejected',
    header: 'Rejected',
    cellClassName: 'tabular-nums',
    render: (s) => (
      <span className={s.rejected ? 'text-destructive' : 'text-muted-foreground'}>
        {s.rejected}
      </span>
    ),
  },
  {
    key: 'review',
    header: 'Review',
    cellClassName: 'tabular-nums',
    render: (s) => (
      <span className={s.pending_review ? 'text-foreground' : 'text-muted-foreground'}>
        {s.pending_review}
      </span>
    ),
  },
  { key: 'slo', header: 'SLO', render: (s) => sloBadge(s) },
];

function sloBadge(s: HotelStats) {
  const total = s.staged || 1;
  const success = s.committed / total;
  const dupeRatio = s.duplicates / total;
  const className =
    success >= 0.7 && dupeRatio < 0.5
      ? 'bg-muted text-foreground'
      : success >= 0.4
        ? 'bg-muted text-foreground'
        : 'bg-destructive/10 dark:bg-destructive/40 text-destructive';
  return (
    <span className={`inline-block text-2xs px-2 py-0.5 rounded-full font-medium ${className}`}>
      {(success * 100).toFixed(0)}% commit
    </span>
  );
}

function RatioBar({ actual, expected }: { actual: number; expected: number | null }) {
  if (!expected || expected <= 0) return <span className="text-muted-foreground">—</span>;
  const pct = Math.min(1, actual / expected);
  const bg = pct >= 0.8 ? 'bg-foreground' : pct >= 0.4 ? 'bg-foreground' : 'bg-destructive';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full transition-all ${bg}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-xs2 text-muted-foreground tabular-nums">
        {actual}/{expected}
      </span>
    </div>
  );
}

const coverageColumns: AdminSimpleColumn<CoverageRow>[] = [
  {
    key: 'source',
    header: 'Source',
    cellClassName: 'font-mono text-xs',
    render: (r) => r.source_slug,
  },
  {
    key: 'city',
    header: 'City',
    render: (r) =>
      r.city_id ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <code className="text-2xs text-muted-foreground">{r.city_id.slice(0, 8)}</code>
          </TooltipTrigger>
          <TooltipContent className="text-xs font-mono">{r.city_id}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'type',
    header: 'Type',
    cellClassName: 'text-xs',
    render: (r) => r.accommodation_type ?? '—',
  },
  {
    key: 'coverage',
    header: 'Coverage',
    render: (r) => <RatioBar actual={r.actual_count} expected={r.expected_count} />,
  },
  {
    key: 'last_run',
    header: 'Last run',
    cellClassName: 'text-muted-foreground text-xs',
    render: (r) => (
      <span title={r.last_run_at ? new Date(r.last_run_at).toISOString() : ''}>
        {r.last_run_at ? formatDistanceToNow(new Date(r.last_run_at), { addSuffix: true }) : '—'}
      </span>
    ),
  },
  {
    key: 'enabled',
    header: 'Enabled',
    render: (r) =>
      r.is_enabled ? (
        <Check className="h-3.5 w-3.5 text-foreground" />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default function CoverageTab() {
  const qc = useQueryClient();

  const { data: coverage = [], isLoading: covLoading } = useQuery<CoverageRow[]>({
    queryKey: ['source-coverage'],
    queryFn: fetchSourceCoverageTargets,
    refetchInterval: 60_000,
  });

  const { data: hotelStats = [] } = useQuery<HotelStats[]>({
    queryKey: ['hotel-ingest-stats'],
    queryFn: fetchHotelIngestStats,
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_source_coverage');
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Coverage recomputed');
      qc.invalidateQueries({ queryKey: ['source-coverage'] });
    },
    onError: (e: Error) => toast.error(`Refresh failed: ${e.message}`),
  });

  const bySource = useMemo(() => {
    const m = new Map<string, HotelStats>();
    for (const r of hotelStats) {
      const prev = m.get(r.source);
      if (!prev) m.set(r.source, { ...r });
      else
        m.set(r.source, {
          ...prev,
          staged: prev.staged + r.staged,
          validated: prev.validated + r.validated,
          unique_items: prev.unique_items + r.unique_items,
          duplicates: prev.duplicates + r.duplicates,
          committed: prev.committed + r.committed,
          rejected: prev.rejected + r.rejected,
          pending_review: prev.pending_review + r.pending_review,
        });
    }
    return [...m.values()].sort((a, b) => b.committed - a.committed);
  }, [hotelStats]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Source Coverage & SLOs</span>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="h-8 text-xs"
          >
            {refresh.isPending ? (
              <TrackLoader size={14} className="mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Recompute
          </Button>
        </div>

        {/* Per-source rollup */}
        <div className="rounded-element bg-muted overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <Hotel className="h-3.5 w-3.5" />
            Hotels / B&Bs by source
          </div>
          <AdminSimpleTable
            caption="Hotel and B&B ingestion by source"
            columns={hotelSourceColumns}
            rows={bySource}
            rowKey={(s) => s.source}
            emptyNoun="hotel/B&B ingestion"
            rowClassName={() => 'border-border/40 hover:bg-muted/30 transition-colors'}
          />
        </div>

        {/* Coverage targets */}
        <div className="rounded-element bg-muted overflow-hidden max-h-[500px] overflow-y-auto">
          <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2 sticky top-0 bg-background z-10">
            <Bed className="h-3.5 w-3.5" />
            Coverage targets
            <Badge variant="outline" className="text-2xs px-1.5 py-0 ml-1">
              {coverage.length}
            </Badge>
          </div>
          <AdminSimpleTable
            caption="Coverage targets"
            columns={coverageColumns}
            rows={coverage}
            rowKey={(r) => String(r.id)}
            isLoading={covLoading}
            emptyNoun="targets"
            rowClassName={() => 'border-border/40 hover:bg-muted/30 transition-colors'}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
