import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon, RefreshCw, Hotel, Bed, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface CoverageRow {
  id: number;
  source_slug: string;
  city_id: string | null;
  accommodation_type: string | null;
  expected_count: number | null;
  actual_count: number;
  last_run_at: string | null;
  last_success_at: string | null;
  success_ratio: number | null;
  is_enabled: boolean;
}

interface HotelStats {
  source: string;
  accommodation_type: string;
  staged: number;
  validated: number;
  unique_items: number;
  duplicates: number;
  committed: number;
  rejected: number;
  pending_review: number;
  day: string;
}

function sloBadge(s: HotelStats) {
  const total = s.staged || 1;
  const success = s.committed / total;
  const dupeRatio = s.duplicates / total;
  const className =
    success >= 0.7 && dupeRatio < 0.5 ? 'bg-green-100 text-green-700'
    : success >= 0.4                  ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700';
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${className}`}>
      {(success * 100).toFixed(0)}% commit
    </span>
  );
}

function RatioBar({ actual, expected }: { actual: number; expected: number | null }) {
  if (!expected || expected <= 0) return <span className="text-muted-foreground">—</span>;
  const pct = Math.min(1, actual / expected);
  const bg = pct >= 0.8 ? 'bg-green-500' : pct >= 0.4 ? 'bg-yellow-500' : 'bg-destructive';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full transition-all ${bg}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums">{actual}/{expected}</span>
    </div>
  );
}

export default function CoverageTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: coverage = [], isLoading: covLoading } = useQuery<CoverageRow[]>({
    queryKey: ['source-coverage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('source_coverage_targets')
        .select('*')
        .order('source_slug')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CoverageRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: hotelStats = [] } = useQuery<HotelStats[]>({
    queryKey: ['hotel-ingest-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hotel_ingest_stats').select('*');
      if (error) throw error;
      return (data ?? []) as HotelStats[];
    },
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_source_coverage');
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Coverage recomputed' });
      qc.invalidateQueries({ queryKey: ['source-coverage'] });
    },
    onError: (e: Error) => toast({ title: 'Refresh failed', description: e.message, variant: 'destructive' }),
  });

  const bySource = useMemo(() => {
    const m = new Map<string, HotelStats>();
    for (const r of hotelStats) {
      const prev = m.get(r.source);
      if (!prev) m.set(r.source, { ...r });
      else m.set(r.source, {
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
            {refresh.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Recompute
          </Button>
        </div>

        {/* Per-source rollup */}
        <div className="border border-border rounded-md bg-background overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <Hotel className="h-3.5 w-3.5" />
            Hotels / B&Bs by source
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                {['Source', 'Staged', 'Validated', 'Unique', 'Dupes', 'Committed', 'Rejected', 'Review', 'SLO'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bySource.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">No hotel/B&B ingestion yet</td></tr>
              ) : bySource.map(s => (
                <tr key={s.source} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-medium">{s.source}</td>
                  <td className="px-3 py-2 tabular-nums">{s.staged}</td>
                  <td className="px-3 py-2 tabular-nums">{s.validated}</td>
                  <td className="px-3 py-2 tabular-nums">{s.unique_items}</td>
                  <td className={`px-3 py-2 tabular-nums ${s.duplicates ? 'text-amber-700' : 'text-muted-foreground'}`}>{s.duplicates}</td>
                  <td className={`px-3 py-2 tabular-nums ${s.committed ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>{s.committed}</td>
                  <td className={`px-3 py-2 tabular-nums ${s.rejected ? 'text-destructive' : 'text-muted-foreground'}`}>{s.rejected}</td>
                  <td className={`px-3 py-2 tabular-nums ${s.pending_review ? 'text-amber-700' : 'text-muted-foreground'}`}>{s.pending_review}</td>
                  <td className="px-3 py-2">{sloBadge(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Coverage targets */}
        <div className="border border-border rounded-md bg-background overflow-hidden max-h-[500px] overflow-y-auto">
          <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2 sticky top-0 bg-background z-10">
            <Bed className="h-3.5 w-3.5" />
            Coverage targets
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">{coverage.length}</Badge>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-[37px] z-10">
              <tr className="border-b border-border">
                {['Source', 'City', 'Type', 'Coverage', 'Last run', 'Enabled'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {covLoading ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">Loading…</td></tr>
              ) : coverage.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">No targets configured</td></tr>
              ) : coverage.map(r => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">{r.source_slug}</td>
                  <td className="px-3 py-2">
                    {r.city_id ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="text-[10px] text-muted-foreground">{r.city_id.slice(0, 8)}</code>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs font-mono">{r.city_id}</TooltipContent>
                      </Tooltip>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.accommodation_type ?? '—'}</td>
                  <td className="px-3 py-2"><RatioBar actual={r.actual_count} expected={r.expected_count} /></td>
                  <td className="px-3 py-2 text-muted-foreground text-xs"
                      title={r.last_run_at ? new Date(r.last_run_at).toISOString() : ''}>
                    {r.last_run_at ? formatDistanceToNow(new Date(r.last_run_at), { addSuffix: true }) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {r.is_enabled ? <Check className="h-3.5 w-3.5 text-green-600" /> : <span className="text-muted-foreground">—</span>}
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
