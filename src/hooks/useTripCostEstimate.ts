import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CostSuggestion {
  category: 'food' | 'transport' | 'accommodation' | 'activities' | 'shopping' | 'other';
  title: string;
  amount: number;
  currency: string;
  per_person: number;
  notes?: string;
}

export interface CostEstimateResult {
  currency: string;
  party_size: number;
  suggestions: CostSuggestion[];
}

/**
 * Ask the `trip-cost-estimate` edge function for AI-generated budget
 * suggestions based on the trip's cities, duration, and planned stops.
 * Returns proposals only — caller decides what to persist into
 * `trip_budget_items`.
 */
export function useCostEstimate() {
  return useMutation({
    mutationFn: async (input: { tripId: string; partySize?: number }) => {
      const { data, error } = await supabase.functions.invoke<CostEstimateResult>(
        'trip-cost-estimate',
        { body: { trip_id: input.tripId, party_size: input.partySize ?? 1 } },
      );
      if (error) throw error;
      if (!data) throw new Error('empty response');
      return data;
    },
  });
}
