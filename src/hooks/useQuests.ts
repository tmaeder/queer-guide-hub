import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';

export interface Quest {
  id: string;
  slug: string;
  title: string;
  brief_md: string;
  theme: string | null;
  hero_image_url: string | null;
  criteria_json: {
    entity_type?: 'venue' | 'event' | 'personality' | 'news' | 'place';
    target_count?: number;
    tags?: string[];
    region?: string;
    notes?: string;
  };
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'archived';
  recap_article_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestProgress {
  accepted_count: number;
  pending_count: number;
  contributor_count: number;
  target_count: number;
}

export interface QuestContributor {
  user_id: string;
  display_name: string;
  accepted_count: number;
}

export function useQuests(opts?: { includeDraft?: boolean }) {
  return useQuery({
    queryKey: ['quests', { includeDraft: !!opts?.includeDraft }],
    queryFn: async () => {
      let q = untypedFrom('quests').select('*').order('starts_at', { ascending: false });
      if (!opts?.includeDraft) q = q.neq('status', 'draft');
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Quest[];
    },
  });
}

export function useQuest(slug: string | undefined) {
  return useQuery({
    queryKey: ['quest', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await untypedFrom('quests').select('*').eq('slug', slug!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Quest | null;
    },
  });
}

export function useActiveQuest() {
  return useQuery({
    queryKey: ['quest', 'active'],
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('active_quest');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as Quest | null;
    },
    staleTime: 60_000,
  });
}

export function useQuestProgress(questId: string | undefined) {
  return useQuery({
    queryKey: ['quest-progress', questId],
    enabled: !!questId,
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('quest_progress', { p_quest_id: questId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? { accepted_count: 0, pending_count: 0, contributor_count: 0, target_count: 0 }) as QuestProgress;
    },
  });
}

export function useQuestContributors(questId: string | undefined) {
  return useQuery({
    queryKey: ['quest-contributors', questId],
    enabled: !!questId,
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('quest_public_contributors', { p_quest_id: questId });
      if (error) throw error;
      return ((data ?? []) as unknown) as QuestContributor[];
    },
  });
}

export function useQuestMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['quests'] });

  const create = useMutation({
    mutationFn: async (q: Partial<Quest>) => {
      const { data, error } = await untypedFrom('quests').insert(q).select().single();
      if (error) throw error;
      return data as unknown as Quest;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Quest> & { id: string }) => {
      const { data, error } = await untypedFrom('quests').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return data as unknown as Quest;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('quests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const createRecap = useMutation({
    mutationFn: async (questId: string) => {
      const { data, error } = await untypedSupabase.rpc('quest_create_recap_stub', { p_quest_id: questId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove, createRecap };
}

export function useMyQuestParticipation(questId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['quest-participation', questId, userId],
    enabled: !!questId && !!userId,
    queryFn: async () => {
      const { data, error } = await untypedFrom('quest_participations')
        .select('*')
        .eq('quest_id', questId!)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; opted_in_public: boolean; display_name: string | null } | null;
    },
  });
}

export function useJoinQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { quest_id: string; user_id: string; opted_in_public: boolean; display_name?: string }) => {
      const { data, error } = await untypedFrom('quest_participations')
        .upsert(args, { onConflict: 'user_id,quest_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['quest-participation', vars.quest_id] });
      qc.invalidateQueries({ queryKey: ['quest-contributors', vars.quest_id] });
    },
  });
}
