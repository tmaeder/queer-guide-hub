import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GroupJoinRequest {
  id: string;
  group_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  message: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  group_name?: string | null;
}

/**
 * Admin/moderator view of pending join requests.
 * Pass a groupId to scope to one group; omit to list all requests the
 * caller can see (RLS filters to groups the user admins).
 */
export const useGroupJoinRequests = (groupId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['group-join-requests', groupId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('group_join_requests')
        .select('*, community_groups(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (groupId) query = query.eq('group_id', groupId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        group_name: r.community_groups?.name ?? null,
      })) as GroupJoinRequest[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['user-groups'] });
  };

  const approve = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('approve_group_join_request', {
        request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Approved', description: 'Member added to group.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const reject = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('reject_group_join_request', {
        request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Rejected' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    requests,
    isLoading,
    approve: approve.mutate,
    isApproving: approve.isPending,
    reject: reject.mutate,
    isRejecting: reject.isPending,
  };
};
