import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface VoteState {
  count: number;
  hasVoted: boolean;
}

export function useFeedbackVote(submissionId: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ['feedback-vote', submissionId, user?.id];

  const { data, isLoading } = useQuery<VoteState>({
    queryKey,
    queryFn: async () => {
      const { count, error: countErr } = await supabase
        .from('feedback_votes' as 'venues')
        .select('*', { count: 'exact', head: true })
        .eq('submission_id', submissionId);
      if (countErr) throw countErr;

      let hasVoted = false;
      if (user) {
        const { data: vote } = await supabase
          .from('feedback_votes' as 'venues')
          .select('id')
          .eq('submission_id', submissionId)
          .eq('user_id', user.id)
          .maybeSingle();
        hasVoted = !!vote;
      }

      return { count: count ?? 0, hasVoted };
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Login required to vote');

      if (data?.hasVoted) {
        const { error } = await supabase
          .from('feedback_votes' as 'venues')
          .delete()
          .eq('submission_id', submissionId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('feedback_votes' as 'venues')
          .insert({ submission_id: submissionId, user_id: user.id });
        if (error) throw error;
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VoteState>(queryKey);
      if (previous) {
        queryClient.setQueryData<VoteState>(queryKey, {
          count: previous.hasVoted ? previous.count - 1 : previous.count + 1,
          hasVoted: !previous.hasVoted,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({ title: 'Vote failed', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-votes'] });
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleVote = useCallback(() => {
    if (!user) {
      toast({ title: 'Log in to vote', description: 'Create a free account to upvote feedback.' });
      return;
    }
    mutation.mutate();
  }, [user, mutation, toast]);

  return {
    voteCount: data?.count ?? 0,
    hasVoted: data?.hasVoted ?? false,
    toggleVote,
    isLoading,
  };
}

/** Batch fetch vote counts for multiple submissions (used by board) */
export function useFeedbackVoteCounts(submissionIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['feedback-votes', submissionIds.join(','), user?.id],
    queryFn: async () => {
      if (submissionIds.length === 0) return {};

      // Get all vote counts in one query
      const { data: votes, error } = await supabase
        .from('feedback_votes' as 'venues')
        .select('submission_id')
        .in('submission_id', submissionIds);
      if (error) throw error;

      // Count per submission
      const counts: Record<string, number> = {};
      for (const id of submissionIds) counts[id] = 0;
      for (const v of votes || []) counts[v.submission_id] = (counts[v.submission_id] || 0) + 1;

      // Check user votes
      const userVotes: Record<string, boolean> = {};
      if (user) {
        const { data: myVotes } = await supabase
          .from('feedback_votes' as 'venues')
          .select('submission_id')
          .in('submission_id', submissionIds)
          .eq('user_id', user.id);
        for (const v of myVotes || []) userVotes[v.submission_id] = true;
      }

      const result: Record<string, VoteState> = {};
      for (const id of submissionIds) {
        result[id] = { count: counts[id] || 0, hasVoted: !!userVotes[id] };
      }
      return result;
    },
    enabled: submissionIds.length > 0,
    staleTime: 30_000,
  });
}
