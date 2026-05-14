import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RecognitionPublicRow {
  id: string;
  year: number;
  category: string;
  blurb_md: string | null;
  featured: boolean;
  rank: number | null;
  display_name: string;
  avatar_url: string | null;
  user_id: string;
}

export interface RecognitionRow {
  id: string;
  year: number;
  user_id: string;
  category: string;
  blurb_md: string | null;
  display_name_override: string | null;
  featured: boolean;
  opted_in: boolean;
  rank: number | null;
}

export interface ContributionMetricRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  year: number;
  accepted_submissions: number;
  venue_submissions: number;
  event_submissions: number;
  personality_submissions: number;
  safety_signals: number;
  quest_completions: number;
  translations: number;
  total_submissions: number;
  contribution_score: number;
  appear_in_recognition: boolean;
}

export interface RecognitionUpsert {
  id?: string;
  year: number;
  user_id: string;
  category: string;
  blurb_md: string | null;
  display_name_override: string | null;
  featured: boolean;
  opted_in: boolean;
  rank: number | null;
}

const TABLE_MISSING = (err: { code?: string; message?: string } | null): boolean =>
  !!err && (err.code === 'PGRST205' || /schema cache/i.test(err.message ?? ''));

export function usePublicRecognitions(year: number) {
  return useQuery<{ rows: RecognitionPublicRow[]; error: string | null }>({
    queryKey: ['recognitions', 'public', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contributor_recognitions_public')
        .select('*')
        .eq('year', year)
        .order('featured', { ascending: false })
        .order('rank', { ascending: true, nullsFirst: false });
      if (error) {
        if (TABLE_MISSING(error)) return { rows: [], error: null };
        return { rows: [], error: error.message };
      }
      return { rows: (data ?? []) as RecognitionPublicRow[], error: null };
    },
  });
}

export function useAdminRecognitions(year: number) {
  return useQuery<RecognitionRow[]>({
    queryKey: ['recognitions', 'admin', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contributor_recognitions')
        .select('*')
        .eq('year', year)
        .order('featured', { ascending: false })
        .order('rank', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RecognitionRow[];
    },
  });
}

export function useContributionMetrics(year: number) {
  return useQuery<ContributionMetricRow[]>({
    queryKey: ['contribution-metrics', year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contribution_metrics_for_year', {
        p_year: year,
      });
      if (error) throw error;
      return (data ?? []) as ContributionMetricRow[];
    },
  });
}

export function useRecognitionMutations(year: number) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['recognitions', 'admin', year] });

  const upsert = useMutation({
    mutationFn: async (payload: RecognitionUpsert) => {
      const body = {
        year: payload.year,
        user_id: payload.user_id,
        category: payload.category,
        blurb_md: payload.blurb_md,
        display_name_override: payload.display_name_override,
        featured: payload.featured,
        opted_in: payload.opted_in,
        rank: payload.rank,
      };
      const { error } = payload.id
        ? await supabase.from('contributor_recognitions').update(body).eq('id', payload.id)
        : await supabase.from('contributor_recognitions').insert(body);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contributor_recognitions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const refreshMetrics = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_contribution_metrics_yearly');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contribution-metrics', year] });
    },
  });

  return { upsert, remove, refreshMetrics };
}
