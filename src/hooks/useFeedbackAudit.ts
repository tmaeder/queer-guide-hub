import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FeedbackAuditEntry } from '@/components/admin/feedback/types';

/** Activity log for a single submission (latest first). */
export function useFeedbackAudit(submissionId: string | null) {
  return useQuery<FeedbackAuditEntry[]>({
    queryKey: ['admin-feedback-audit', submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      if (!submissionId) return [];
      const { data, error } = await supabase
        .from('community_submissions_audit')
        .select('id,submission_id,actor_id,field,old_value,new_value,at')
        .eq('submission_id', submissionId)
        .order('at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as FeedbackAuditEntry[];
    },
    staleTime: 15_000,
  });
}
