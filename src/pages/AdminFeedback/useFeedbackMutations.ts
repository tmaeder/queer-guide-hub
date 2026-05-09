import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  updateCommunitySubmission,
  updateCommunitySubmissionsByIds,
} from '@/hooks/usePageFetchers';
import { useReplyToFeedback } from '@/hooks/useFeedbackReply';
import { useNotifyFeedbackStatus } from '@/hooks/useFeedbackNotify';
import { useRecordHandoff, useUpdateHandoff } from '@/hooks/useFeedbackHandoff';
import type { FeedbackResolution } from '@/components/admin/feedback/types';
import type { KanbanStatus } from '@/components/admin/feedback/constants';
import type { FeedbackSubmission } from '@/components/admin/feedback/types';

export function useFeedbackMutations(items: FeedbackSubmission[]) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [forwardingIds, setForwardingIds] = useState<Set<string>>(new Set());

  const replyMutation = useReplyToFeedback();
  const notifyStatus = useNotifyFeedbackStatus();
  const recordHandoff = useRecordHandoff();
  const updateHandoff = useUpdateHandoff();

  const updateRow = useCallback(
    async (ids: string[], patch: Record<string, unknown>) => {
      if (ids.length === 0) return;
      const { error } = await updateCommunitySubmissionsByIds(ids, {
        ...patch,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    [user],
  );

  const pushToGithub = useCallback(
    (id: string, action: 'reply' | 'close' | 'reopen' | 'set_labels', extra: Record<string, unknown> = {}) => {
      const it = items.find((i) => i.id === id);
      if (!it?.github_issue_number) return;
      void supabase.functions
        .invoke('push-feedback-to-github', { body: { submission_id: id, action, ...extra } })
        .catch((e) => console.warn('push-feedback-to-github failed', e));
    },
    [items],
  );

  const fireStatusNotification = useCallback(
    (ids: string[], status: KanbanStatus) => {
      for (const id of ids) {
        const it = items.find((i) => i.id === id);
        if (!it || it.is_spam || it.duplicate_of || !it.notify_submitter) continue;
        if (!it.data.contact_email) continue;
        const event = status === 'done' ? 'resolved' : 'status_changed';
        notifyStatus.mutate({ submissionId: id, event, newStatus: status });
      }
    },
    [items, notifyStatus],
  );

  const statusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: KanbanStatus }) =>
      updateRow(ids, { feedback_status: status }),
    onMutate: async ({ ids, status }) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (idSet.has(it.id) ? { ...it, feedback_status: status } : it)),
      );
    },
    onSuccess: (_data, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      fireStatusNotification(ids, status);
      for (const id of ids) {
        if (status === 'done') pushToGithub(id, 'close', { resolution: 'fixed' });
        else if (status === 'in_progress') pushToGithub(id, 'reopen');
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
  });

  const priorityMutation = useMutation({
    mutationFn: ({ ids, priority }: { ids: string[]; priority: number }) =>
      updateRow(ids, { priority }),
    onMutate: async ({ ids, priority }) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (idSet.has(it.id) ? { ...it, priority } : it)),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
    onError: (err: Error) =>
      toast({ title: 'Priority failed', description: err.message, variant: 'destructive' }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ ids, assigneeId }: { ids: string[]; assigneeId: string | null }) =>
      updateRow(ids, { assignee_id: assigneeId }),
    onMutate: async ({ ids, assigneeId }) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (idSet.has(it.id) ? { ...it, assignee_id: assigneeId } : it)),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
    onError: (err: Error) =>
      toast({ title: 'Assign failed', description: err.message, variant: 'destructive' }),
  });

  const labelsMutation = useMutation({
    mutationFn: async ({ id, labels }: { id: string; labels: string[] }) => {
      const { error } = await updateCommunitySubmission(id, { labels });
      if (error) throw error;
    },
    onMutate: async ({ id, labels }) => {
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (it.id === id ? { ...it, labels } : it)),
      );
    },
    onSuccess: (_data, { id, labels }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      pushToGithub(id, 'set_labels', { labels });
    },
    onError: (err: Error) =>
      toast({ title: 'Labels failed', description: err.message, variant: 'destructive' }),
  });

  const resolutionMutation = useMutation({
    mutationFn: async ({
      id,
      resolution,
    }: {
      id: string;
      resolution: FeedbackResolution | null;
    }) => {
      const { error } = await updateCommunitySubmission(id, {
        resolution,
        resolved_at: resolution ? new Date().toISOString() : null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      });
      if (error) throw error;
      return { id, resolution };
    },
    onSuccess: (_data, { id, resolution }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      if (resolution) pushToGithub(id, 'close', { resolution });
      else pushToGithub(id, 'reopen');
      const it = items.find((i) => i.id === id);
      if (!it || it.is_spam || it.duplicate_of || !it.notify_submitter) return;
      if (!it.data.contact_email) return;
      notifyStatus.mutate({
        submissionId: id,
        event: resolution ? 'resolved' : 'reopened',
      });
    },
    onError: (err: Error) =>
      toast({ title: 'Resolution failed', description: err.message, variant: 'destructive' }),
  });

  const notesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await updateCommunitySubmission(id, { reviewer_notes: notes });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      toast({ title: 'Notes saved' });
    },
  });

  const forwardMutation = useMutation({
    mutationFn: async (id: string) => {
      setForwardingIds((prev) => new Set(prev).add(id));
      try {
        const { data, error } = await supabase.functions.invoke('forward-feedback-to-github', {
          body: { submission_id: id },
        });
        if (error) throw error;
        return { id, data };
      } finally {
        setForwardingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    onSuccess: ({ id, data }) => {
      if (data?.already_forwarded) {
        toast({ title: 'Already forwarded', description: `Issue #${data.number}` });
      } else {
        toast({ title: 'Forwarded to GitHub', description: `Issue #${data.number} created` });
      }
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) =>
          it.id === id
            ? {
                ...it,
                github_issue_url: data.url,
                github_issue_number: data.number,
                forwarded_at: new Date().toISOString(),
              }
            : it,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['admin-api-errors'] });
      const it = items.find((i) => i.id === id);
      if (
        it &&
        !it.is_spam &&
        !it.duplicate_of &&
        it.notify_submitter &&
        it.data?.contact_email
      ) {
        notifyStatus.mutate({ submissionId: id, event: 'handed_to_claude' });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Forward failed', description: err.message, variant: 'destructive' });
    },
  });

  return {
    toast,
    queryClient,
    forwardingIds,
    replyMutation,
    recordHandoff,
    updateHandoff,
    statusMutation,
    priorityMutation,
    assignMutation,
    labelsMutation,
    resolutionMutation,
    notesMutation,
    forwardMutation,
  };
}
