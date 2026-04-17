/**
 * FX rates lookup. Reads `fx_rates` (currency, rate_to_usd) and returns
 * a Map keyed by currency for O(1) conversion. Synced daily by the
 * `marketplace-fx-sync` edge function — call sites should treat the data
 * as eventually-consistent (no realtime invalidation).
 *
 * Used by the settle-up summary to normalize multi-currency expenses
 * before computing balances.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useFxRates() {
  return useQuery({
    queryKey: ['fx-rates'],
    staleTime: 60 * 60 * 1000, // 1h — rates refresh daily, hourly stale is plenty.
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('currency, rate_to_usd');
      if (error) throw error;
      const m = new Map<string, number>();
      for (const row of data ?? []) {
        const r = Number((row as { rate_to_usd: number | string }).rate_to_usd);
        if (Number.isFinite(r) && r > 0) {
          m.set((row as { currency: string }).currency, r);
        }
      }
      return m;
    },
  });
}
