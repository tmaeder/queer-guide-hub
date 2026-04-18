import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

  return useMutation({
    mutationFn: async (): Promise<LlmSuggestionsResult> => {
      if (!tripId) throw new Error('tripId required');
      const { data, error } = await supabase.functions.invoke(
        'packing-suggestions-llm',
        { body: { trip_id: tripId } },
      );
      if (error) throw error;
      return data as LlmSuggestionsResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip-packing-suggestions', tripId] });
    },
  });
}
