import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  FeedbackHandoff,
  FeedbackSubmission,
  HandoffStatus,
  HandoffTarget,
} from '@/components/admin/feedback/types';

interface RecordArgs {
  submissionId: string;
  target: HandoffTarget;
  promptPreview?: string | null;
  note?: string | null;
}

/**
 * Record that an admin just handed the ticket off to Claude (via copy/paste)
 * or somewhere else. Appends a handoff entry to `data.handoffs`. No schema
 * change — the list lives in the existing jsonb.
 *
 * Admins update the entry's status later (sent → in_progress → resolved /
 * failed) using `useUpdateHandoff` when they know what happened.
 */
export function useRecordHandoff() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation<FeedbackHandoff, Error, RecordArgs>({
    mutationFn: async ({ submissionId, target, promptPreview, note }) => {
      const { data: row, error: fetchErr } = await supabase
        .from('community_submissions')
        .select('data')
        .eq('id', submissionId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) throw new Error('Submission not found');

      const data = (row.data ?? {}) as Record<string, unknown>;
      const handoffs = (Array.isArray(data.handoffs)
        ? (data.handoffs as FeedbackHandoff[])
        : []) as FeedbackHandoff[];

      const displayName =
        (user?.user_metadata?.display_name as string | undefined) ||
        user?.email ||
        'Admin';

      const entry: FeedbackHandoff = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        by: user?.id ?? null,
        by_name: displayName,
        target,
        prompt_preview: promptPreview?.slice(0, 160) ?? null,
        note: note ?? null,
        status: 'sent',
      };

      const next = { ...data, handoffs: [...handoffs, entry] };
      const { error: updErr } = await supabase
        .from('community_submissions')
        .update({ data: next })
        .eq('id', submissionId);
      if (updErr) throw updErr;

      return entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
  });
}

/** Flip an existing handoff entry's status (sent → in_progress / resolved / failed). */
export function useUpdateHandoff() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { submissionId: string; handoffId: string; status?: HandoffStatus; note?: string | null }
  >({
    mutationFn: async ({ submissionId, handoffId, status, note }) => {
      const { data: row, error: fetchErr } = await supabase
        .from('community_submissions')
        .select('data')
        .eq('id', submissionId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) throw new Error('Submission not found');

      const data = (row.data ?? {}) as Record<string, unknown>;
      const handoffs = (Array.isArray(data.handoffs)
        ? (data.handoffs as FeedbackHandoff[])
        : []) as FeedbackHandoff[];
      const at = new Date().toISOString();

      const next = handoffs.map((h) =>
        h.id !== handoffId
          ? h
          : {
              ...h,
              ...(status ? { status, status_at: at } : {}),
              ...(note !== undefined ? { note } : {}),
            },
      );

      const { error: updErr } = await supabase
        .from('community_submissions')
        .update({ data: { ...data, handoffs: next } })
        .eq('id', submissionId);
      if (updErr) throw updErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
  });
}

/** Pick the most recent handoff for display on cards + drawer headers. */
export function latestHandoff(item: FeedbackSubmission): FeedbackHandoff | null {
  const list = item.data.handoffs;
  if (!list || list.length === 0) return null;
  return list.reduce<FeedbackHandoff | null>((latest, h) => {
    if (!latest) return h;
    return h.at > latest.at ? h : latest;
  }, null);
}
