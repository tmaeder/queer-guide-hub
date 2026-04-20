import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface PendingJoinRequest {
  id: string;
  group_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  message: string | null;
  created_at: string;
  group_name?: string;
}

/**
 * Admin/moderator hook: lists pending join requests across groups the caller
 * moderates, and exposes approve/reject mutations backed by security-definer
 * RPCs.
 */
export const useGroupJoinRequests = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['group-join-requests', 'pending', user?.id],
    queryFn: async (): Promise<PendingJoinRequest[]> => {
      if (!user?.id) return [];

      // RLS restricts visible rows to those the caller moderates or owns.
      const { data, error } = await supabase
        .from('group_join_requests')
        .select(`
          id, group_id, user_id, status, message, created_at,
          community_groups(name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data ?? [])
        .filter((r) => r.user_id !== user.id) // hide caller's own requests from admin queue
        .map((r) => ({
          id: r.id,
          group_id: r.group_id,
          user_id: r.user_id,
          status: r.status,
          message: r.message,
          created_at: r.created_at,
          group_name: (r as { community_groups?: { name?: string } }).community_groups?.name,
        }));
    },
    enabled: !!user?.id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['user-groups'] });
  };

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('approve_group_join_request', {
        request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Request approved' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('reject_group_join_request', {
        request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Request rejected' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    requests,
    isLoading,
    approve: approveMutation.mutate,
    isApproving: approveMutation.isPending,
    reject: rejectMutation.mutate,
    isRejecting: rejectMutation.isPending,
  };
};
