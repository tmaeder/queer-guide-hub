import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type NotifyEvent =
  | 'status_changed'
  | 'handed_to_claude'
  | 'resolved'
  | 'reopened';

interface Args {
  submissionId: string;
  event: NotifyEvent;
  newStatus?: string;
}

/**
 * Fire a ticketing-style email to the submitter when admin moves a card.
 * Best-effort: errors toast but do not block the underlying mutation.
 */
export function useNotifyFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, Args>({
    mutationFn: async ({ submissionId, event, newStatus }) => {
      const { data, error } = await supabase.functions.invoke('notify-feedback-status', {
        body: {
          submission_id: submissionId,
          event,
          ...(newStatus ? { new_status: newStatus } : {}),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // thread is stored in data.replies → the board query owns it.
      qc.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
  });
}
