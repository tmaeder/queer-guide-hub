import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTrip } from '@/hooks/useTrips';
import { useTripWeatherSignals, type WeatherSignal } from '@/hooks/useDayWeather';

/** Compact one-line weather summary for the LLM prompt (and cache hash). */
export function summarizeWeatherSignals(byDate: Record<string, WeatherSignal>): string | null {
  const rows = Object.values(byDate);
  if (rows.length === 0) return null;
  const min = Math.round(Math.min(...rows.map((r) => r.tMinC)));
  const max = Math.round(Math.max(...rows.map((r) => r.tMaxC)));
  const wet = rows.filter((r) => /rain|drizzle|thunder|snow/i.test(r.label)).length;
  const typical = rows.every((r) => r.typical);
  const prefix = typical ? 'Typical for the season' : 'Forecast';
  const wetPart = wet > 0 ? `, precipitation on ${wet} of ${rows.length} days` : '';
  return `${prefix}: ${min}–${max}°C${wetPart}`;
}

interface LlmItem {
  query: string;
  reason: string;
  priority: 'must' | 'nice' | 'optional';
}
interface LlmCategory {
  name: string;
  items: LlmItem[];
}
export interface LlmSuggestionsResult {
  categories: LlmCategory[];
  cached: boolean;
}

/**
 * Invokes the `packing-suggestions-llm` edge function to produce smarter,
 * activity-aware packing queries via Claude Haiku. Cached per trip for 24h,
 * rate-limited server-side to 3 distinct snapshots per trip per day.
 *
 * On success, invalidates the rule-based query so the panel re-renders
 * against the refreshed marketplace matches.
 */
export function useLlmPackingSuggestions(tripId: string | undefined) {
  const qc = useQueryClient();
  const { data: trip } = useTrip(tripId);
  const weatherByDate = useTripWeatherSignals(trip);

  return useMutation({
    mutationFn: async (): Promise<LlmSuggestionsResult> => {
      if (!tripId) throw new Error('tripId required');
      const weather = summarizeWeatherSignals(weatherByDate);
      const { data, error } = await supabase.functions.invoke(
        'packing-suggestions-llm',
        { body: { trip_id: tripId, ...(weather ? { weather } : {}) } },
      );
      if (error) throw error;
      return data as LlmSuggestionsResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip-packing-suggestions', tripId] });
    },
  });
}
