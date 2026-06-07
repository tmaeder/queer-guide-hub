import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PersonalityQualityOverview {
  active: number;
  anchored: number;
  anchored_pct: number | null;
  archived: number;
  triage_insufficient: number;
  pending_requeue: number;
  needs_attention: number;
  bio_extractable: number;
  has_connection: number;
  flagged_nonperson: number;
  low_confidence_matches: number;
  computed_at: string;
}

/**
 * Aggregate cohort health for the personalities admin surface — reconciliation
 * coverage, archived/triage buckets, re-queue drain progress, and low-confidence
 * matches. Backed by the personality_quality_overview() RPC.
 */
export function usePersonalityQualityOverview() {
  return useQuery<PersonalityQualityOverview | null>({
    queryKey: ['personality-quality-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('personality_quality_overview');
      if (error) throw error;
      return (data as unknown as PersonalityQualityOverview) ?? null;
    },
    staleTime: 60_000,
  });
}
