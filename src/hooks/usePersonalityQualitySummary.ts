import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PersonalityCoverageGap {
  personality_id: string;
  personality_name: string | null;
  gap_score: number;
  missing_fields: string[] | null;
  resolution: string;
}

export interface PersonalityQualitySummary {
  gaps: PersonalityCoverageGap[];
  publicCount: number;
  needsAttention: number;
  reviewOpen: number;
  lowCompleteness: number;
  promotable: number;
  adultConsentCandidates: number;
}

// New tables/RPCs are not in the generated Supabase types yet.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Health summary for the Personality Truth Engine (coverage gaps + queue + counts). */
export function usePersonalityQualitySummary() {
  return useQuery<PersonalityQualitySummary>({
    queryKey: ['personality-quality-summary'],
    queryFn: async () => {
      const [gaps, publicCount, needsAttention, reviewOpen, lowCompleteness, promotable, adultConsent] =
        await Promise.all([
          db
            .from('personality_coverage_gaps')
            .select('personality_id, personality_name, gap_score, missing_fields, resolution')
            .eq('status', 'open')
            .eq('resolution', 'enrich')
            .order('gap_score', { ascending: false })
            .limit(10),
          db.from('personalities').select('id', { count: 'exact', head: true }).eq('visibility', 'public').is('duplicate_of_id', null),
          db.from('personalities').select('id', { count: 'exact', head: true }).eq('needs_attention', true).is('duplicate_of_id', null),
          db.from('personality_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
          db
            .from('personalities')
            .select('id', { count: 'exact', head: true })
            .lt('completeness_score', 40)
            .eq('visibility', 'draft')
            .neq('review_status', 'archived')
            .is('duplicate_of_id', null),
          db.rpc('personalities_promotable', { p_limit: 2000 }),
          db.rpc('personalities_adult_consent_candidates', { p_limit: 1000 }),
        ]);
      return {
        gaps: (gaps.data ?? []) as PersonalityCoverageGap[],
        publicCount: publicCount.count ?? 0,
        needsAttention: needsAttention.count ?? 0,
        reviewOpen: reviewOpen.count ?? 0,
        lowCompleteness: lowCompleteness.count ?? 0,
        promotable: ((promotable.data as unknown[]) ?? []).length,
        adultConsentCandidates: ((adultConsent.data as unknown[]) ?? []).length,
      };
    },
    staleTime: 60_000,
  });
}
