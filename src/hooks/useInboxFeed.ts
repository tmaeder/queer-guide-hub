import { useEffect, useId } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type InboxKind = 'chat' | 'mail' | 'notification';
export type InboxFilter = 'all' | 'chats' | 'mail' | 'alerts';

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
      const { data, error } = await supabase.rpc('get_inbox_feed', {
        p_user: user!.id,
        p_cursor: pageParam?.ts ?? null,
        p_cursor_id: pageParam?.id ?? null,
        p_filter: filter,
        p_limit: PAGE,
      } as never);
      if (error) throw error;
      return (data ?? []) as InboxItem[];
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
      const { data, error } = await supabase.rpc('get_inbox_unread_count' as never, {
        p_user: user!.id,
      } as never);
      if (error) {
        console.error('get_inbox_unread_count failed', error);
        return 0;
      }
      return (data as number) ?? 0;
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, instanceId, queryClient]);

  return {
    items: (feed.data?.pages.flat() ?? []) as InboxItem[],
    unreadCount: countQuery.data ?? 0,
    loading: feed.isLoading,
    hasNextPage: feed.hasNextPage,
    fetchNextPage: feed.fetchNextPage,
    refetch: feed.refetch,
  };
}
