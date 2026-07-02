import { useQuery } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';

interface PruneStats {
  archived_by_reason: Record<string, number>;
  remaining_candidates: number;
  active_total: number;
}

/**
 * Aggregator-prune status: archived counts per wave + remaining candidates.
 * The automation itself is paused/resumed from the automations UI; reversal
 * is `select revert_marketplace_catalog_prune('<reason>')` batched.
 */
export function MarketplacePruneCard() {
  const { data } = useQuery({
    queryKey: ['marketplace-prune-stats'],
    queryFn: async (): Promise<PruneStats | null> => {
      const { data, error } = await untypedSupabase.rpc('marketplace_prune_stats');
      if (error) throw error;
      return (data as PruneStats | null) ?? null;
    },
  });

  if (!data) return null;
  const waves = Object.entries(data.archived_by_reason ?? {});

  return (
    <section className="rounded-element border border-border p-4">
      <h2 className="text-15 font-semibold">Catalog prune</h2>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">Active listings</p>
          <p className="text-title font-bold tabular-nums">{data.active_total.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">Prune candidates left</p>
          <p className="text-title font-bold tabular-nums">{data.remaining_candidates.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">Archived</p>
          {waves.length === 0 ? (
            <p className="text-title font-bold tabular-nums">0</p>
          ) : (
            <ul className="text-13">
              {waves.map(([reason, n]) => (
                <li key={reason} className="tabular-nums">
                  {n.toLocaleString()} <span className="text-muted-foreground">({reason})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
