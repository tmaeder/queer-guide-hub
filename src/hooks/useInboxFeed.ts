import { useEffect, useId } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export type InboxKind = 'chat' | 'mail' | 'notification' | 'trip_email';
export type InboxFilter = 'all' | 'chats' | 'mail' | 'alerts' | 'trips';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  subtype: string;
  title: string;
  preview: string;
  avatar_url: string | null;
  ts: string;
  unread: boolean;
  open_target: string;
  // Chat-only rail metadata (null/false/0 for mail + notifications).
  other_user_id: string | null;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  unread_count: number;
  last_sender_is_me: boolean | null;
  last_message_subtype: string | null;
}

const PAGE = 30;
const feedKey = (userId: string | undefined, filter: InboxFilter) =>
  ['inbox-feed', userId, filter] as const;
const countKey = (userId: string | undefined) => ['inbox-unread', userId] as const;

export function useInboxFeed(filter: InboxFilter = 'all') {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const instanceId = useId();

  const feed = useInfiniteQuery({
    queryKey: feedKey(user?.id, filter),
    enabled: !!user,
    initialPageParam: null as { ts: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      // 'trips' is a real RPC filter since 20260704130000: trip-email threads
      // + trip_nudge alerts.
      const { data, error } = await untypedRpc<InboxItem[]>('get_inbox_feed', {
        p_user: user!.id,
        p_cursor: pageParam?.ts ?? null,
        p_cursor_id: pageParam?.id ?? null,
        p_filter: filter,
        p_limit: PAGE,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last: InboxItem[]) =>
      last.length === PAGE
        ? { ts: last[last.length - 1].ts, id: last[last.length - 1].id }
        : undefined,
  });

  const countQuery = useQuery({
    queryKey: countKey(user?.id),
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<number>('get_inbox_unread_count', {
        p_user: user!.id,
      });
      if (error) {
        console.error('get_inbox_unread_count failed', error);
        return 0;
      }
      return data ?? 0;
    },
  });

  useEffect(() => {
    if (!user) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox-feed', user.id] });
      void queryClient.invalidateQueries({ queryKey: countKey(user.id) });
    };
    const channel = supabase
      .channel(`inbox-feed:${user.id}:${instanceId}`)
      // messages/conversations carry no direct user_id column to filter on, so we
      // subscribe broadly and let the per-user query refetch reconcile; mailbox/
      // notifications are user-filtered.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, invalidate)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mailbox_emails',
          filter: `owner_id=eq.${user.id}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        invalidate,
      )
      // post_likes/post_comments carry the actor's user_id (liker/commenter), not
      // the recipient (the post author), so there's no filterable recipient column —
      // subscribe broadly and let the per-user query refetch reconcile.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, invalidate)
      // trip-email threads: items key on trip_id (no user column) — subscribe
      // broadly, per-user refetch reconciles (same rationale as messages).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_inbox_items' }, invalidate)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_inbox_messages' },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, instanceId, queryClient]);

  // Pins float to the top of the already-loaded feed (client-side pass so the
  // RPC's (ts,id) cursor pagination stays simple). A pinned chat older than the
  // loaded window is an accepted edge case.
  const flat = (feed.data?.pages.flat() ?? []) as InboxItem[];
  const items = flat.some((i) => i.is_pinned)
    ? [...flat].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
    : flat;

  return {
    items,
    unreadCount: countQuery.data ?? 0,
    loading: feed.isLoading,
    hasNextPage: feed.hasNextPage,
    fetchNextPage: feed.fetchNextPage,
    refetch: feed.refetch,
  };
}
