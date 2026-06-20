import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Per-user rail actions on a conversation (pin / mute / archive / mark-read).
 * All write the caller's own conversation_participants row — covered by the
 * existing self-update RLS — and invalidate the inbox feed to refresh.
 */
export function useRailActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    if (!user) return;
    void queryClient.invalidateQueries({ queryKey: ['inbox-feed', user.id] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-unread', user.id] });
  }, [queryClient, user]);

  const update = useCallback(
    async (conversationId: string, patch: Record<string, unknown>) => {
      if (!user) return;
      const { error } = await supabase
        .from('conversation_participants')
        .update(patch)
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
      if (error) {
        console.error('rail action failed', error);
        return;
      }
      invalidate();
    },
    [user, invalidate],
  );

  return {
    togglePin: (conversationId: string, next: boolean) => update(conversationId, { is_pinned: next }),
    toggleMute: (conversationId: string, next: boolean) => update(conversationId, { is_muted: next }),
    toggleArchive: (conversationId: string, next: boolean) =>
      update(conversationId, { is_archived: next }),
    markRead: (conversationId: string) =>
      update(conversationId, { last_read_at: new Date().toISOString() }),
  };
}
