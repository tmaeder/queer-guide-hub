import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PersonalityReviewRow {
  id: string;
  personality_id: string;
  field: string;
  proposed_value: { value?: unknown; rationale?: string | null } | null;
  citations: { url?: string; quote?: string }[] | null;
  confidence: number | null;
  created_at: string;
  personalities: { name: string; slug: string } | null;
}

export interface AdultConsentCandidate {
  id: string;
  name: string;
  slug: string;
  lgbti_connection: string | null;
  lgbti_connection_source: string | null;
  lgbti_relevance_score: number | null;
  has_bio: boolean;
  has_image: boolean;
  wikidata_qid: string | null;
}

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * The Personality Truth Engine review surface: LLM-proposed identity fields
 * (lgbti_connection / lgbti_details) awaiting a human gate, plus the adult-cohort
 * consent-publish candidates (never auto-published — admin confirms each).
 */
export function usePersonalityReviewQueue() {
  const queryClient = useQueryClient();

  const queue = useQuery<PersonalityReviewRow[]>({
    queryKey: ['personality-review-queue'],
    queryFn: async () => {
      const { data, error } = await db
        .from('personality_review_queue')
        .select('id, personality_id, field, proposed_value, citations, confidence, created_at, personalities(name, slug)')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PersonalityReviewRow[];
    },
    staleTime: 30_000,
  });

  const consent = useQuery<AdultConsentCandidate[]>({
    queryKey: ['personality-adult-consent'],
    queryFn: async () => {
      const { data, error } = await db.rpc('personalities_adult_consent_candidates', { p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as AdultConsentCandidate[];
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['personality-review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['personality-adult-consent'] });
    queryClient.invalidateQueries({ queryKey: ['personality-quality-summary'] });
  };

  const decide = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => {
      const fn = action === 'approve' ? 'approve_personality_review' : 'reject_personality_review';
      const { error } = await db.rpc(fn, { p_id: id, p_note: note ?? null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Publish an adult-cohort personality WITH explicit consent confirmation.
  const publishWithConsent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc('publish_personality_with_consent', { p_id: id, p_confirm: true });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { queue, consent, decide, publishWithConsent };
}
