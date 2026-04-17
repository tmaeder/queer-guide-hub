import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  FeedbackStory,
  StoryMember,
  StorySuggestion,
  StoryStatus,
  StoryWithCounts,
  SubmissionStoryRef,
} from '@/components/admin/feedback/types';

const STORY_COLUMNS =
  'id,title,summary,status,priority,labels,assignee_id,created_by,created_at,updated_at,resolved_at,origin,handoffs';

export function useStories() {
  return useQuery<StoryWithCounts[]>({
    queryKey: ['admin-feedback-stories'],
    queryFn: async () => {
      const { data: stories, error } = await supabase
        .from('feedback_stories')
        .select(STORY_COLUMNS)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const { data: members, error: mErr } = await supabase
        .from('feedback_story_members')
        .select('story_id, submission_id, community_submissions!inner(content_type)');
      if (mErr) throw mErr;

      const counts: Record<string, { feedback: number; error: number }> = {};
      for (const m of members ?? []) {
        const row = m as unknown as {
          story_id: string;
          community_submissions: { content_type: string } | { content_type: string }[];
        };
        const ct = Array.isArray(row.community_submissions)
          ? row.community_submissions[0]?.content_type
          : row.community_submissions?.content_type;
        const c = (counts[row.story_id] ??= { feedback: 0, error: 0 });
        if (ct === 'api_error') c.error += 1;
        else c.feedback += 1;
      }

      return ((stories as unknown as FeedbackStory[]) ?? []).map((s) => {
        const c = counts[s.id] ?? { feedback: 0, error: 0 };
        return { ...s, feedback_count: c.feedback, error_count: c.error, member_count: c.feedback + c.error };
      });
    },
    staleTime: 30_000,
  });
}

export function useStory(storyId: string | null) {
  return useQuery<{ story: FeedbackStory; members: StoryMember[] } | null>({
    queryKey: ['admin-feedback-story', storyId],
    enabled: !!storyId,
    queryFn: async () => {
      if (!storyId) return null;
      const [{ data: story, error: sErr }, { data: members, error: mErr }] = await Promise.all([
        supabase.from('feedback_stories').select(STORY_COLUMNS).eq('id', storyId).maybeSingle(),
        supabase
          .from('feedback_story_members')
          .select('story_id,submission_id,added_at,added_by,confidence')
          .eq('story_id', storyId),
      ]);
      if (sErr) throw sErr;
      if (mErr) throw mErr;
      if (!story) return null;
      return {
        story: story as unknown as FeedbackStory,
        members: (members as unknown as StoryMember[]) ?? [],
      };
    },
  });
}

export function useSubmissionStoryMap() {
  return useQuery<Record<string, SubmissionStoryRef>>({
    queryKey: ['admin-feedback-story-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback_story_members')
        .select('submission_id, feedback_stories!inner(id,title,status)');
      if (error) throw error;
      const map: Record<string, SubmissionStoryRef> = {};
      for (const row of data ?? []) {
        const r = row as unknown as {
          submission_id: string;
          feedback_stories:
            | { id: string; title: string; status: StoryStatus }
            | { id: string; title: string; status: StoryStatus }[];
        };
        const s = Array.isArray(r.feedback_stories) ? r.feedback_stories[0] : r.feedback_stories;
        if (!s) continue;
        const existing = map[r.submission_id];
        if (!existing || (existing.status === 'resolved' && s.status !== 'resolved')) {
          map[r.submission_id] = { story_id: s.id, title: s.title, status: s.status };
        }
      }
      return map;
    },
    staleTime: 30_000,
  });
}

export function useStorySuggestions() {
  return useQuery<StorySuggestion[]>({
    queryKey: ['admin-feedback-story-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback_story_suggestions')
        .select('id,proposed_title,member_ids,avg_similarity,method,dismissed,created_at')
        .eq('dismissed', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as StorySuggestion[]) ?? [];
    },
    staleTime: 60_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin-feedback-stories'] });
  qc.invalidateQueries({ queryKey: ['admin-feedback-story-map'] });
  qc.invalidateQueries({ queryKey: ['admin-feedback-story-suggestions'] });
}

export function useCreateStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { title: string; submissionIds: string[]; summary?: string }) => {
      const { data, error } = await supabase.rpc('create_story', {
        p_title: args.title,
        p_submission_ids: args.submissionIds,
        p_summary: args.summary ?? null,
        p_origin: 'manual',
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddStoryMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string; submissionIds: string[] }) => {
      const { error } = await supabase.rpc('add_story_members', {
        p_story_id: args.storyId,
        p_submission_ids: args.submissionIds,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: ['admin-feedback-story', args.storyId] });
    },
  });
}

export function useRemoveStoryMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string; submissionIds: string[] }) => {
      const { error } = await supabase.rpc('remove_story_members', {
        p_story_id: args.storyId,
        p_submission_ids: args.submissionIds,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: ['admin-feedback-story', args.storyId] });
    },
  });
}

export function useUpdateStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string; patch: Partial<Omit<FeedbackStory, 'id'>> }) => {
      const { error } = await supabase
        .from('feedback_stories')
        .update(args.patch)
        .eq('id', args.storyId);
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: ['admin-feedback-story', args.storyId] });
    },
  });
}

export function useResolveStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string; closeItems: boolean }) => {
      const { data, error } = await supabase.rpc('resolve_story', {
        p_story_id: args.storyId,
        p_close_items: args.closeItems,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (_d, args) => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: ['admin-feedback-story', args.storyId] });
      qc.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      qc.invalidateQueries({ queryKey: ['admin-api-errors'] });
    },
  });
}

export function useAcceptStorySuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { suggestionId: string; overrideTitle?: string }) => {
      const { data, error } = await supabase.rpc('accept_story_suggestion', {
        p_suggestion_id: args.suggestionId,
        p_override_title: args.overrideTitle ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDismissStorySuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('feedback_story_suggestions')
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', suggestionId);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-feedback-story-suggestions'] }),
  });
}

export function useGroupedStories(stories: StoryWithCounts[] | undefined) {
  return useMemo(() => {
    const map: Record<StoryStatus, StoryWithCounts[]> = {
      open: [],
      planned: [],
      in_progress: [],
      resolved: [],
      archived: [],
    };
    for (const s of stories ?? []) map[s.status].push(s);
    return map;
  }, [stories]);
}
