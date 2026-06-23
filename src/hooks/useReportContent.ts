import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ReportableContentType = 'community_post' | 'post_comment' | 'profile' | 'group';

export interface ReportContentInput {
  contentType: ReportableContentType;
  contentId: string;
  reason: string;
  details?: string;
}

/** Files a user report into moderation_flags via the report_content RPC. */
export function useReportContent() {
  return useMutation({
    mutationFn: async (input: ReportContentInput): Promise<string> => {
      const { data, error } = await supabase.rpc('report_content', {
        p_content_type: input.contentType,
        p_content_id: input.contentId,
        p_reason: input.reason,
        p_details: input.details?.trim() ? input.details.trim() : undefined,
      });
      if (error) throw error;
      return data as string;
    },
  });
}
