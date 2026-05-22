import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FxRates } from '@/components/marketplace/marketplaceHelpers';

export type { FxRates };

const FALLBACK: FxRates = { USD: 1 };

/**
 * Live FX rates from public.fx_rates. `rate_to_usd` is the multiplier
 * to convert a native amount → USD (native_amount × rate = usd).
 * To convert USD → another currency, divide by that currency's rate.
 */
export function useFxRates() {
  return useQuery<FxRates>({
    queryKey: ['fx-rates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('currency, rate_to_usd');
      if (error) throw error;
      const map: FxRates = { USD: 1 };
      for (const row of (data ?? []) as Array<{ currency: string; rate_to_usd: number | string }>) {
        const code = row.currency?.toUpperCase();
        const rate = typeof row.rate_to_usd === 'string' ? parseFloat(row.rate_to_usd) : row.rate_to_usd;
        if (code && Number.isFinite(rate) && rate > 0) map[code] = rate;
      }
      return map;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: FALLBACK,
  });
}

