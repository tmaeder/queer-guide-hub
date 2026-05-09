import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Activity, BarChart3, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { listFrom } from '@/hooks/usePageFetchers';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CoverageRow {
  source_name: string;
  entity_type: string;
  started_at: string;
  entities_parsed: number;
  pct_geo: number | null;
  pct_phone: number | null;
  pct_website: number | null;
  pct_images: number | null;
  pct_tags: number | null;
  pct_address: number | null;
  pct_description: number | null;
}

interface OrphanRow {
  entity_type: string;
  orphan_count: number;
}

interface QualityRow {
  entity_type: string;
  source_name: string;
  n: number;
  score_min: number;
  score_p25: number;
  score_p50: number;
  score_p75: number;
  score_max: number;
  score_avg: number;
}

function PctCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const colorClass =
    v >= 80 ? 'text-green-600 dark:text-green-400'
    : v >= 50 ? 'text-amber-600 dark:text-amber-400'
    : 'text-destructive';
  return <span className={`font-mono tabular-nums ${colorClass}`}>{v.toFixed(1)}%</span>;
}

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ComponentType<{ className?: string }>; title: string; badge?: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span>{title}</span>
      {badge}
    </div>
  );
}

export default function ScraperHealthTab() {
  const qc = useQueryClient();

  const { data: coverage = [], isLoading: covLoading } = useQuery<CoverageRow[]>({
    queryKey: ['scraper-coverage'],
    queryFn: () => listFrom<CoverageRow>('scraper_ingest_coverage', '*', undefined, 200),
    refetchInterval: 120_000,
  });

  const { data: orphans = [] } = useQuery<OrphanRow[]>({
    queryKey: ['scraper-orphans'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('scraper_reconcile_orphans');
      if (error) throw error;
      return (data ?? []) as OrphanRow[];
    },
    refetchInterval: 5 * 60_000,
  });

  const { data: quality = [] } = useQuery<QualityRow[]>({
    queryKey: ['pipeline-quality-dist'],
    queryFn: () => listFrom<QualityRow>('pipeline_quality_distribution', '*', undefined, 200),
    refetchInterval: 5 * 60_000,
  });

  const prune = useMutation({
    mutationFn: async (entityType: string) => {
      const { data, error } = await supabase.rpc('scraper_prune_orphan_mappings', { p_entity_type: entityType });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, entityType) => {
      toast({ title: `Pruned ${n} orphan ${entityType} mappings` });
      qc.invalidateQueries({ queryKey: ['scraper-orphans'] });
    },
    onError: (e: Error) => toast.error(`Prune failed: ${e.message}`),
  });

  const totalOrphans = orphans.reduce((s, o) => s + o.orphan_count, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Orphans */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <SectionHeader
          icon={AlertTriangle}
          title="Orphan mappings"
          badge={
            totalOrphans > 0
              ? <Badge variant="outline" className="text-2xs px-1.5 py-0 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900">{totalOrphans} total</Badge>
              : undefined
          }
        />
        {totalOrphans === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 inline mr-1" />
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">No orphans — entity_map is clean</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">Entity type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">Orphans</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map(o => (
                <tr key={o.entity_type} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 capitalize">{o.entity_type}</td>
                  <td className={`px-3 py-2 tabular-nums font-semibold ${o.orphan_count > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {o.orphan_count}
                  </td>
                  <td className="px-3 py-2">
                    {o.orphan_count > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (window.confirm(`Prune ${o.orphan_count} orphan ${o.entity_type} mappings?`)) {
                            prune.mutate(o.entity_type);
                          }
                        }}
                        disabled={prune.isPending}
                      >
                        {prune.isPending && prune.variables === o.entity_type
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <Trash2 className="h-3 w-3 mr-1" />}
                        Prune
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Field coverage */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <SectionHeader icon={Activity} title="Field coverage per recent run" />
        <div className="max-h-[400px] overflow-auto">
          {covLoading ? (
            <div className="p-6 text-center text-muted-foreground text-xs">Loading…</div>
          ) : coverage.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs">No completed runs yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="border-b border-border">
                  {['Source', 'Type', 'Parsed', 'Started', 'Geo', 'Phone', 'Website', 'Images', 'Tags', 'Address', 'Desc'].map(h => (
                    <th key={h} className="text-left px-2 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coverage.map((c, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="px-2 py-1.5 font-mono text-xs">{c.source_name}</td>
                    <td className="px-2 py-1.5 text-xs capitalize">{c.entity_type}</td>
                    <td className="px-2 py-1.5 tabular-nums">{c.entities_parsed}</td>
                    <td className="px-2 py-1.5 text-muted-foreground text-xs2"
                        title={new Date(c.started_at).toISOString()}>
                      {formatDistanceToNow(new Date(c.started_at), { addSuffix: true })}
                    </td>
                    <td className="px-2 py-1.5"><PctCell v={c.pct_geo} /></td>
                    <td className="px-2 py-1.5"><PctCell v={c.pct_phone} /></td>
                    <td className="px-2 py-1.5"><PctCell v={c.pct_website} /></td>
                    <td className="px-2 py-1.5"><PctCell v={c.pct_images} /></td>
                    <td className="px-2 py-1.5"><PctCell v={c.pct_tags} /></td>
                    <td className="px-2 py-1.5"><PctCell v={c.pct_address} /></td>
                    <td className="px-2 py-1.5"><PctCell v={c.pct_description} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quality score distribution */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <SectionHeader icon={BarChart3} title="Quality score distribution" badge={<Badge variant="outline" className="text-2xs px-1.5 py-0">30-day · per source × type</Badge>} />
        <div className="max-h-[400px] overflow-auto">
          {quality.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs">No scored items yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="border-b border-border">
                  {['Entity', 'Source', 'N', 'min', 'p25', 'p50', 'p75', 'max', 'avg'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quality.map((q, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-1.5 capitalize">{q.entity_type}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{q.source_name}</td>
                    <td className="px-3 py-1.5 tabular-nums">{q.n}</td>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{q.score_min}</td>
                    <td className="px-3 py-1.5 tabular-nums">{q.score_p25}</td>
                    <td className="px-3 py-1.5 tabular-nums font-semibold">{q.score_p50}</td>
                    <td className="px-3 py-1.5 tabular-nums">{q.score_p75}</td>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{q.score_max}</td>
                    <td className="px-3 py-1.5 tabular-nums font-mono">{q.score_avg.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
