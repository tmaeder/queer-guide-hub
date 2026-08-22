import { useQuery } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';

interface Snapshot {
  taken_at: string;
  stats: Record<string, number>;
}
interface QualityStats {
  latest: Snapshot | null;
  previous: Snapshot | null;
}

const ROWS: { key: string; label: string }[] = [
  { key: 'dept_other', label: 'Department “other”' },
  { key: 'boilerplate_rows', label: 'Boilerplate descriptions' },
  { key: 'no_description', label: 'No description' },
  { key: 'thin_description', label: 'Thin description' },
  { key: 'no_image', label: 'No image' },
  { key: 'alt_text_missing', label: 'Images without alt text' },
  { key: 'relevance_default_06', label: 'Relevance at 0.6 default' },
  { key: 'link_never_checked', label: 'Link never checked' },
  { key: 'no_merchant_id', label: 'No merchant link' },
  { key: 'brands_pending', label: 'Brands pending review' },
];

/**
 * Nightly marketplace quality snapshot (run_marketplace_quality_snapshot,
 * 05:25 UTC) with the delta against the previous night — a regression shows
 * up as a rising number here instead of a rediscovery months later.
 */
export function MarketplaceQualityStatsPanel() {
  const { data } = useQuery({
    queryKey: ['marketplace-quality-stats'],
    queryFn: async (): Promise<QualityStats | null> => {
      const { data, error } = await untypedSupabase.rpc('marketplace_quality_stats');
      if (error) throw error;
      return (data as QualityStats | null) ?? null;
    },
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
      <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {ROWS.map(({ key, label }) => {
          const v = cur[key];
          if (v === undefined) return null;
          const delta = prev?.[key] !== undefined ? v - prev[key] : null;
          return (
            <li key={key} className="flex items-baseline justify-between gap-2 text-13">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums font-semibold">
                {v.toLocaleString()}
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
    </section>
  );
}
