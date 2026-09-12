import { formatDistanceToNow } from 'date-fns';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Activity, BarChart3, Trash2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { listFrom } from '@/hooks/usePageFetchers';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';

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
  const colorClass = v >= 80 ? 'text-foreground' : v >= 50 ? 'text-foreground' : 'text-destructive';
  return <span className={`font-mono tabular-nums ${colorClass}`}>{v.toFixed(1)}%</span>;
}

function SectionHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span>{title}</span>
      {badge}
    </div>
  );
}

const coverageColumns: AdminSimpleColumn<CoverageRow>[] = [
  {
    key: 'source',
    header: 'Source',
    cellClassName: 'px-2 py-1.5 font-mono text-xs',
    render: (c) => c.source_name,
  },
  {
    key: 'type',
    header: 'Type',
    cellClassName: 'px-2 py-1.5 text-xs capitalize',
    render: (c) => c.entity_type,
  },
  {
    key: 'parsed',
    header: 'Parsed',
    cellClassName: 'px-2 py-1.5 tabular-nums',
    render: (c) => c.entities_parsed,
  },
  {
    key: 'started',
    header: 'Started',
    cellClassName: 'px-2 py-1.5 text-muted-foreground text-xs2',
    render: (c) => (
      <span title={new Date(c.started_at).toISOString()}>
        {formatDistanceToNow(new Date(c.started_at), { addSuffix: true })}
      </span>
    ),
  },
  {
    key: 'geo',
    header: 'Geo',
    cellClassName: 'px-2 py-1.5',
    render: (c) => <PctCell v={c.pct_geo} />,
  },
  {
    key: 'phone',
    header: 'Phone',
    cellClassName: 'px-2 py-1.5',
    render: (c) => <PctCell v={c.pct_phone} />,
  },
  {
    key: 'website',
    header: 'Website',
    cellClassName: 'px-2 py-1.5',
    render: (c) => <PctCell v={c.pct_website} />,
  },
  {
    key: 'images',
    header: 'Images',
    cellClassName: 'px-2 py-1.5',
    render: (c) => <PctCell v={c.pct_images} />,
  },
  {
    key: 'tags',
    header: 'Tags',
    cellClassName: 'px-2 py-1.5',
    render: (c) => <PctCell v={c.pct_tags} />,
  },
  {
    key: 'address',
    header: 'Address',
    cellClassName: 'px-2 py-1.5',
    render: (c) => <PctCell v={c.pct_address} />,
  },
  {
    key: 'desc',
    header: 'Desc',
    cellClassName: 'px-2 py-1.5',
    render: (c) => <PctCell v={c.pct_description} />,
  },
];

const qualityColumns: AdminSimpleColumn<QualityRow>[] = [
  {
    key: 'entity',
    header: 'Entity',
    cellClassName: 'py-1.5 capitalize',
    render: (q) => q.entity_type,
  },
  {
    key: 'source',
    header: 'Source',
    cellClassName: 'py-1.5 font-mono text-xs',
    render: (q) => q.source_name,
  },
  { key: 'n', header: 'N', cellClassName: 'py-1.5 tabular-nums', render: (q) => q.n },
  {
    key: 'min',
    header: 'min',
    cellClassName: 'py-1.5 tabular-nums text-muted-foreground',
    render: (q) => q.score_min,
  },
  { key: 'p25', header: 'p25', cellClassName: 'py-1.5 tabular-nums', render: (q) => q.score_p25 },
  {
    key: 'p50',
    header: 'p50',
    cellClassName: 'py-1.5 tabular-nums font-semibold',
    render: (q) => q.score_p50,
  },
  { key: 'p75', header: 'p75', cellClassName: 'py-1.5 tabular-nums', render: (q) => q.score_p75 },
  {
    key: 'max',
    header: 'max',
    cellClassName: 'py-1.5 tabular-nums text-muted-foreground',
    render: (q) => q.score_max,
  },
  {
    key: 'avg',
    header: 'avg',
    cellClassName: 'py-1.5 tabular-nums font-mono',
    render: (q) => q.score_avg.toFixed(1),
  },
];

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
      const { data, error } = await supabase.rpc('scraper_prune_orphan_mappings', {
        p_entity_type: entityType,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, entityType) => {
      toast.success(`Pruned ${n} orphan ${entityType} mappings`);
      qc.invalidateQueries({ queryKey: ['scraper-orphans'] });
    },
    onError: (e: Error) => toast.error(`Prune failed: ${e.message}`),
  });

  const totalOrphans = orphans.reduce((s, o) => s + o.orphan_count, 0);

  const orphanColumns: AdminSimpleColumn<OrphanRow>[] = [
    {
      key: 'entity_type',
      header: 'Entity type',
      cellClassName: 'capitalize',
      render: (o) => o.entity_type,
    },
    {
      key: 'orphans',
      header: 'Orphans',
      cellClassName: 'tabular-nums font-semibold',
      render: (o) => (
        <span className={o.orphan_count > 0 ? 'text-destructive' : 'text-muted-foreground'}>
          {o.orphan_count}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (o) =>
        o.orphan_count > 0 && (
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
            {prune.isPending && prune.variables === o.entity_type ? (
              <TrackLoader size={12} className="mr-1" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            Prune
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Orphans */}
      <div className="rounded-element bg-muted overflow-hidden">
        <SectionHeader
          icon={AlertTriangle}
          title="Orphan mappings"
          badge={
            totalOrphans > 0 ? (
              <Badge
                variant="outline"
                className="border text-2xs px-1.5 py-0 bg-destructive/10 dark:bg-destructive/30 text-destructive border-destructive dark:border-destructive"
              >
                {totalOrphans} total
              </Badge>
            ) : undefined
          }
        />
        {totalOrphans === 0 ? (
          <div className="p-6 text-center">
            <CheckCircle className="h-5 w-5 text-foreground inline mr-1" />
            <span className="text-sm text-foreground font-medium">
              No orphans — entity_map is clean
            </span>
          </div>
        ) : (
          <AdminSimpleTable
            caption="Orphan entity mappings"
            columns={orphanColumns}
            rows={orphans}
            rowKey={(o) => o.entity_type}
            emptyNoun="orphan mappings"
            rowClassName={() => 'border-border/40 hover:bg-muted/30 transition-colors'}
          />
        )}
      </div>

      {/* Field coverage */}
      <div className="rounded-element bg-muted overflow-hidden">
        <SectionHeader icon={Activity} title="Field coverage per recent run" />
        <div className="max-h-[400px] overflow-auto">
          {covLoading ? (
            <AdminTextSkeleton lines={2} />
          ) : coverage.length === 0 ? (
            <AdminEmpty
              variant="inline"
              noun="completed runs"
              className="p-6 text-center text-xs"
            />
          ) : (
            <AdminSimpleTable
              caption="Field coverage per recent scraper run"
              stickyHeader
              columns={coverageColumns}
              rows={coverage}
              rowKey={(_c, i) => String(i)}
              emptyNoun="completed runs"
              rowClassName={() => 'border-border/40 hover:bg-muted/30 transition-colors'}
            />
          )}
        </div>
      </div>

      {/* Quality score distribution */}
      <div className="rounded-element bg-muted overflow-hidden">
        <SectionHeader
          icon={BarChart3}
          title="Quality score distribution"
          badge={
            <Badge variant="outline" className="text-2xs px-1.5 py-0">
              30-day · per source × type
            </Badge>
          }
        />
        <div className="max-h-[400px] overflow-auto">
          {quality.length === 0 ? (
            <AdminEmpty variant="inline" noun="scored items" className="p-6 text-center text-xs" />
          ) : (
            <AdminSimpleTable
              caption="Quality score distribution by source and entity type"
              stickyHeader
              columns={qualityColumns}
              rows={quality}
              rowKey={(_q, i) => String(i)}
              emptyNoun="scored items"
              rowClassName={() => 'border-border/40 hover:bg-muted/30 transition-colors'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
