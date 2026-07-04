import { supabase } from '@/integrations/supabase/client';
import { createQualitySummaryHook } from '@/hooks/quality/createQualitySummaryHook';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Health summary for the Personality Truth Engine (coverage gaps + queue + counts). */
export const usePersonalityQualitySummary = createQualitySummaryHook({
  queryKey: 'personality-quality-summary',
  metrics: {
    gaps: {
      kind: 'rows',
      build: () =>
        db
          .from('personality_coverage_gaps')
          .select('personality_id, personality_name, gap_score, missing_fields, resolution')
          .eq('status', 'open')
          .eq('resolution', 'enrich')
          .order('gap_score', { ascending: false })
          .limit(10),
    },
    publicCount: {
      kind: 'count',
      build: () =>
        db
          .from('personalities')
          .select('id', { count: 'exact', head: true })
          .eq('visibility', 'public')
          .is('duplicate_of_id', null),
    },
    needsAttention: {
      kind: 'count',
      build: () =>
        db
          .from('personalities')
          .select('id', { count: 'exact', head: true })
          .eq('needs_attention', true)
          .is('duplicate_of_id', null),
    },
    reviewOpen: {
      kind: 'count',
      build: () =>
        db.from('personality_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    },
    lowCompleteness: {
      kind: 'count',
      build: () =>
        db
          .from('personalities')
          .select('id', { count: 'exact', head: true })
          .lt('completeness_score', 40)
          .eq('visibility', 'draft')
          .neq('review_status', 'archived')
          .is('duplicate_of_id', null),
    },
    promotable: {
      kind: 'rows',
      build: () => db.rpc('personalities_promotable', { p_limit: 2000 }),
    },
    adultConsentCandidates: {
      kind: 'rows',
      build: () => db.rpc('personalities_adult_consent_candidates', { p_limit: 1000 }),
    },
  },
  reshape: (r): PersonalityQualitySummary => ({
    gaps: r.gaps as PersonalityCoverageGap[],
    publicCount: r.publicCount,
    needsAttention: r.needsAttention,
    reviewOpen: r.reviewOpen,
    lowCompleteness: r.lowCompleteness,
    promotable: r.promotable.length,
    adultConsentCandidates: r.adultConsentCandidates.length,
  }),
});
