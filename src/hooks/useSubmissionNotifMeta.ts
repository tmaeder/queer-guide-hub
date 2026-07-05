import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InboxItem } from '@/hooks/useInboxFeed';

export interface SubmissionNotifMeta {
  outcome?: 'published' | 'approved' | 'rejected' | 'needs_info';
  submission_ids?: string[];
  item_title?: string;
  reviewer_notes?: string | null;
  promoted_to_table?: string | null;
  promoted_to_id?: string | null;
}

/** Lazily fetch a submission_update notification's metadata (not in the feed RPC). */
export function useSubmissionNotifMeta(item: InboxItem) {
  const isSubmission = item.subtype === 'submission_update' && item.id.startsWith('notif_');
  return useQuery({
    queryKey: ['notification-meta', item.id],
    enabled: isSubmission,
    staleTime: 60_000,
    queryFn: async (): Promise<SubmissionNotifMeta | null> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('metadata')
        .eq('id', item.id.slice('notif_'.length))
        .maybeSingle();
      if (error) throw error;
      return (data?.metadata as SubmissionNotifMeta | null) ?? null;
    },
  });
}
