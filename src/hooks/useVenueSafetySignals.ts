import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface SafetyQuestion {
  question_id: string;
  slug: string;
  prompt: string;
}

export interface SafetyScoreRow {
  question_slug: string;
  prompt: string;
  yes_weighted: number;
  no_weighted: number;
  n_responses: number;
  score: number | null;
  confidence_low: number | null;
  confidence_high: number | null;
  last_signal_at: string | null;
}

export function useVenueSafetyScore(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-safety-score', venueId],
    enabled: Boolean(venueId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SafetyScoreRow[]> => {
      const { data, error } = await supabase.rpc('get_venue_safety_score', {
        p_venue_id: venueId!,
      });
      if (error) throw error;
      return (data ?? []) as SafetyScoreRow[];
    },
  });
}

export function useVenueSafetyPrompts(venueId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['venue-safety-prompts', venueId, user?.id ?? 'anon'],
    enabled: Boolean(venueId && user),
    staleTime: 60_000,
    queryFn: async (): Promise<SafetyQuestion[]> => {
      const { data, error } = await supabase.rpc('get_venue_safety_questions', {
        p_venue_id: venueId!,
      });
      if (error) throw error;
      return (data ?? []) as SafetyQuestion[];
    },
  });
}

export function useSubmitSafetySignal(venueId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { questionId: string; answer: boolean }) => {
      const { data, error } = await supabase.rpc('submit_venue_safety_signal', {
        p_venue_id: venueId!,
        p_question_id: args.questionId,
        p_answer: args.answer,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { ok: boolean; reason: string | null }
        | undefined;
      if (!row?.ok) throw new Error(row?.reason ?? 'submit_failed');
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venue-safety-score', venueId] });
      qc.invalidateQueries({ queryKey: ['venue-safety-prompts', venueId] });
    },
  });
}
