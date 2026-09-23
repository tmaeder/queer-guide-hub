import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';

interface Snapshot {
  taken_at: string;
  stats: Record<string, number>;
}
interface QualityStats {
  latest: Snapshot | null;
  previous: Snapshot | null;
  alerts?: {
    id: number;
    type: string;
    severity: 'warning' | 'critical';
    message: string;
  }[];
  taxonomy_rollout?: {
    phase: 'canary' | 'expanding' | 'complete' | 'rolled_back' | 'paused';
    processed_count: number;
  } | null;
  recent_events?: QualityEvent[];
}
interface TaxonomyValue {
  department?: string | null;
  group?: string | null;
  fine?: string | null;
}
interface QualityEvent {
  id: number;
  listing_id: string;
  dimension: string;
  previous_value: TaxonomyValue | string | null;
  new_value: TaxonomyValue | string | null;
  classifier_version: string;
  confidence: number | null;
  rollback_of: number | null;
  rolled_back_at: string | null;
  created_at: string;
}

const SECTIONS: { title: string; rows: { key: string; label: string; suffix?: string }[] }[] = [
  {
    title: 'Content & taxonomy',
    rows: [
      { key: 'dept_other', label: 'Department “other”' },
      { key: 'safety_conflicts', label: 'SFW/category contradictions' },
      { key: 'boilerplate_rows', label: 'Boilerplate descriptions' },
      { key: 'no_description', label: 'No description' },
      { key: 'thin_description', label: 'Thin description' },
    ],
  },
  {
    title: 'Media',
    rows: [
      { key: 'no_image', label: 'No image' },
      { key: 'image_opt_missing', label: 'No healthy optimized image' },
      { key: 'image_opt_failed', label: 'Failed image optimization' },
      { key: 'image_dimensions_missing', label: 'Image dimensions missing' },
      { key: 'image_under_600px', label: 'Images under 600 px (sample)' },
      { key: 'image_pixel_sample_size', label: 'Pixel-quality sample size' },
      { key: 'image_under_600px_pct', label: 'Sample under 600 px', suffix: '%' },
      { key: 'alt_text_missing', label: 'Images without alt text' },
    ],
  },
  {
    title: 'Variants & relationships',
    rows: [
      { key: 'attributes_pending', label: 'Attribute extraction backlog' },
      { key: 'variant_rows', label: 'Variant rows' },
      { key: 'variant_listings', label: 'Listings with variants' },
      { key: 'source_link_missing', label: 'No source provenance' },
      { key: 'no_merchant_id', label: 'No merchant link' },
      { key: 'inactive_unexplained', label: 'Inactive without reason' },
      { key: 'price_history_usd_missing', label: 'Price history missing USD' },
    ],
  },
  {
    title: 'Freshness & workers',
    rows: [
      { key: 'link_never_checked', label: 'Link never checked' },
      { key: 'link_stale_30d', label: 'Not verified/feed-confirmed in 30d' },
      { key: 'link_checker_24h_examined', label: 'Link checks (24h)' },
      { key: 'variant_24h_examined', label: 'Variant visits (24h)' },
      { key: 'variant_estimated_drain_hours', label: 'Variant drain estimate', suffix: 'h' },
      { key: 'variant_worker_enabled', label: 'Variant worker enabled' },
      { key: 'variant_worker_failures', label: 'Variant consecutive failures' },
      {
        key: 'variant_last_productive_hours',
        label: 'Variant last productive run',
        suffix: 'h ago',
      },
      { key: 'link_worker_enabled', label: 'Link worker enabled' },
      { key: 'link_worker_failures', label: 'Link consecutive failures' },
      { key: 'link_last_productive_hours', label: 'Link last productive run', suffix: 'h ago' },
      {
        key: 'description_last_productive_hours',
        label: 'Description last productive run',
        suffix: 'h ago',
      },
      { key: 'workers_no_progress_3', label: 'Workers stalled for 3 runs' },
    ],
  },
];

/**
 * Nightly marketplace quality snapshot (run_marketplace_quality_snapshot,
 * 05:25 UTC) with the delta against the previous night — a regression shows
 * up as a rising number here instead of a rediscovery months later.
 */
export function MarketplaceQualityStatsPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['marketplace-quality-stats'],
    queryFn: async (): Promise<QualityStats | null> => {
      const { data, error } = await untypedSupabase.rpc('marketplace_quality_stats');
      if (error) throw error;
      return (data as QualityStats | null) ?? null;
    },
  });
  const rollback = useMutation({
    mutationFn: async (eventId: number) => {
      const { error } = await untypedSupabase.rpc('marketplace_rollback_quality_events', {
        p_event_ids: [eventId],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Taxonomy change rolled back');
      queryClient.invalidateQueries({ queryKey: ['marketplace-quality-stats'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!data?.latest) return null;
  const cur = data.latest.stats;
  const prev = data.previous?.stats;

  return (
    <section className="rounded-element bg-muted p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-15 font-semibold">Data quality</h2>
        <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">
          {cur.active_total?.toLocaleString()} active · snapshot{' '}
          {new Date(data.latest.taken_at).toLocaleDateString()}
        </p>
      </div>
      {(data.alerts?.length || data.taxonomy_rollout) && (
        <div className="mt-4 space-y-2" aria-live="polite">
          {data.taxonomy_rollout && data.taxonomy_rollout.phase !== 'complete' && (
            <p className="rounded-element border border-border bg-background px-4 py-2 text-12 text-muted-foreground">
              Taxonomy v4 rollout: <strong>{data.taxonomy_rollout.phase}</strong> ·{' '}
              {data.taxonomy_rollout.processed_count.toLocaleString()} listings visited
            </p>
          )}
          {data.alerts?.map((alert) => (
            <p
              key={alert.id}
              className={`rounded-element border px-4 py-2 text-12 ${
                alert.severity === 'critical'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-border bg-background text-foreground'
              }`}
            >
              {alert.message}
            </p>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {section.title}
            </h3>
            <ul className="mt-1 space-y-1">
              {section.rows.map(({ key, label, suffix }) => {
                const v = cur[key];
                if (v === undefined) return null;
                const never = key.endsWith('last_productive_hours') && v < 0;
                const delta = !never && prev?.[key] !== undefined ? v - prev[key] : null;
                return (
                  <li key={key} className="flex items-baseline justify-between gap-2 text-13">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="tabular-nums font-semibold">
                      {never ? 'never' : `${v.toLocaleString()}${suffix ?? ''}`}
                      {delta !== null && delta !== 0 && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({delta > 0 ? '+' : ''}
                          {delta.toLocaleString()})
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {!!data.recent_events?.length && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Recent quality events
          </h3>
          <ul className="mt-2 space-y-2">
            {data.recent_events.map((event) => {
              const previous = event.previous_value as TaxonomyValue | null;
              const next = event.new_value as TaxonomyValue | null;
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-element border border-border bg-background p-2 text-12"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {event.dimension === 'taxonomy'
                        ? `${previous?.department ?? '—'} / ${previous?.group ?? '—'} → ${next?.department ?? '—'} / ${next?.group ?? '—'}`
                        : `${String(event.previous_value)} → ${String(event.new_value)}`}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {event.listing_id} · {event.classifier_version}
                      {event.confidence !== null
                        ? ` · ${(event.confidence * 100).toFixed(0)}% confidence`
                        : ''}
                    </p>
                  </div>
                  {event.dimension === 'taxonomy' &&
                    !event.rolled_back_at &&
                    !event.rollback_of && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={rollback.isPending}
                        onClick={() => rollback.mutate(event.id)}
                      >
                        Roll back
                      </Button>
                    )}
                  {event.rolled_back_at && (
                    <span className="text-muted-foreground">Rolled back</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
