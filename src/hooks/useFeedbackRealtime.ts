import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AdminPresence {
  userId: string;
  displayName: string;
  viewingId: string | null;
}

/**
 * Live updates + presence for /admin/feedback.
 *
 * - Debounces invalidateQueries so a storm of inserts does not refetch per row.
 * - Tracks which admin has which submission drawer open (viewingId) so
 *   other admins see an avatar cluster on that card.
 */
export function useFeedbackRealtime(viewingId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [online, setOnline] = useState<AdminPresence[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const invalidateDebounced = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
        queryClient.invalidateQueries({ queryKey: ['admin-api-errors'] });
      }, 500);
    };

    const invalidateStories = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin-feedback-stories'] });
        queryClient.invalidateQueries({ queryKey: ['admin-feedback-story-map'] });
        queryClient.invalidateQueries({ queryKey: ['admin-feedback-story-suggestions'] });
      }, 500);
    };

    const dbChannel = supabase
      .channel('admin-feedback-db')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_submissions' },
        invalidateDebounced,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedback_stories' },
        invalidateStories,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedback_story_members' },
        invalidateStories,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedback_story_suggestions' },
        invalidateStories,
      )
      .subscribe();

    let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
    if (user) {
      presenceChannel = supabase.channel('admin-feedback-presence', {
        config: { presence: { key: user.id } },
      });
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel!.presenceState();
          const members: AdminPresence[] = [];
          for (const presences of Object.values(state)) {
            for (const p of presences as unknown as Array<AdminPresence>) {
              members.push(p);
            }
          }
          setOnline(members);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await presenceChannel!.track({
              userId: user.id,
              displayName:
                user.user_metadata?.display_name || user.email || 'Admin',
              viewingId,
            });
          }
        });
      channelRef.current = presenceChannel;
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(dbChannel);
      if (presenceChannel) supabase.removeChannel(presenceChannel);
      channelRef.current = null;
    };
    // viewingId changes are synced through track() below, not by resubscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, user]);

  // Update tracked presence when the drawer opens / closes.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !user) return;
    ch.track({
      userId: user.id,
      displayName: user.user_metadata?.display_name || user.email || 'Admin',
      viewingId,
    }).catch(() => {
      /* presence track failure is non-fatal */
    });
  }, [viewingId, user]);

  return { online };
}
