import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TwentyInboundRow {
  id: string;
  entity_type: 'organization' | 'merchant' | 'contact';
  entity_id: string;
  external_id: string;
  twenty_record_id: string | null;
  changes: Record<string, { from: unknown; to: string | null }>;
  status: string;
  created_at: string;
}

export function useTwentyInboundReview() {
  const queryClient = useQueryClient();

  const query = useQuery<TwentyInboundRow[]>({
    queryKey: ['twenty-inbound-review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('twenty_inbound_review')
        .select('id, entity_type, entity_id, external_id, twenty_record_id, changes, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as TwentyInboundRow[];
    },
    staleTime: 30_000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' }) => {
      const fn = action === 'approve' ? 'approve_twenty_inbound_change' : 'reject_twenty_inbound_change';
      const { error } = await supabase.rpc(fn, { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['twenty-inbound-review'] });
    },
  });

  return { ...query, decide };
}
