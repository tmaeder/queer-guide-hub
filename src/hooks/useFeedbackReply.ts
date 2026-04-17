import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ReplyArgs {
  submissionId: string;
  body: string;
  notify: boolean;
}

interface ReplyResult {
  success: boolean;
  reply: {
    by: string | null;
    by_name: string;
    body: string;
    at: string;
    emailed: boolean;
    email_id: string | null;
    email_error: string | null;
  };
}

/**
 * POST /functions/v1/reply-to-feedback — appends to data.replies, optionally
 * emails the submitter. Re-fetches the board so the thread and any audit
 * entries (via trigger) show up immediately.
 */
export function useReplyToFeedback() {
  const qc = useQueryClient();
  return useMutation<ReplyResult, Error, ReplyArgs>({
    mutationFn: async ({ submissionId, body, notify }) => {
      const { data, error } = await supabase.functions.invoke('reply-to-feedback', {
        body: { submission_id: submissionId, body, notify },
      });
      if (error) throw error;
      return data as ReplyResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
  });
}
