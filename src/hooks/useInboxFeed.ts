import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { fetchMailboxFeed } from '@/lib/mailboxFeed';

export type InboxKind = 'chat' | 'mail' | 'notification' | 'trip_email';
// 'matches' and 'groups' are lenses over chats: get_inbox_feed returns only
// conversation_type='match'/'group' rows for those filters respectively (see
// the inbox-matches and inbox-feed-group-chat migrations), so they paginate
// like any other server-side filter.
export type InboxFilter = 'all' | 'chats' | 'mail' | 'alerts' | 'trips' | 'matches' | 'groups';

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
  filter === 'mail'
    ? (['inbox-feed', userId, filter, 'received-and-sent'] as const)
    : (['inbox-feed', userId, filter] as const);
const countKey = (userId: string | undefined) => ['inbox-unread', userId] as const;

export type InboxUnreadCounts = Record<InboxFilter, number>;

const ZERO_COUNTS: InboxUnreadCounts = {
  all: 0,
  chats: 0,
  mail: 0,
  alerts: 0,
  matches: 0,
  groups: 0,
  trips: 0,
};

/**
 * Unread count per inbox filter, from one `get_inbox_unread_counts` call. The
 * header badge, the popover tabs and the filter chips all read this one cache
 * entry — none of them mounts a feed. (They used to each mount a full feed and
 * count unread rows inside its first 30-row page.)
 */
export function useInboxUnreadCounts(): InboxUnreadCounts {
  const { user } = useAuth();
  const countQuery = useQuery({
    queryKey: countKey(user?.id),
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<Partial<InboxUnreadCounts>>(
        'get_inbox_unread_counts',
        { p_user: user!.id },
      );
      if (error) {
        console.error('get_inbox_unread_counts failed', error);
        return ZERO_COUNTS;
      }
      return { ...ZERO_COUNTS, ...(data ?? {}) };
    },
  });
  return countQuery.data ?? ZERO_COUNTS;
}

/** Total unread across the whole inbox. */
export function useInboxUnreadCount() {
  return useInboxUnreadCounts().all;
}

// One private channel per signed-in user, shared by every mounted consumer.
// The DB sends `inbox_changed` to `inbox:<user_id>` whenever anything that
// feeds this user's inbox changes (migration 99991795368571).
let shared: { userId: string; refs: number; teardown: () => void } | null = null;

/**
 * Keeps the inbox caches fresh. Mount it once per screen (the header does);
 * extra mounts share the same channel.
 */
export function useInboxRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    if (shared && shared.userId !== userId) {
      shared.teardown();
      shared = null;
    }
    if (!shared) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const invalidate = () => {
        clearTimeout(timer);
        // Coalesce bursts (one message pings sender and recipient, a read
        // clears several rows) into a single refetch.
        timer = setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ['inbox-feed', userId] });
          void queryClient.invalidateQueries({ queryKey: countKey(userId) });
        }, 250);
      };
      const channel = supabase
        .channel(`inbox:${userId}`, { config: { private: true } })
        .on('broadcast', { event: 'inbox_changed' }, invalidate)
        .subscribe();
      shared = {
        userId,
        refs: 0,
        teardown: () => {
          clearTimeout(timer);
          void supabase.removeChannel(channel);
        },
      };
    }
    const entry = shared;
    entry.refs += 1;
    return () => {
      entry.refs -= 1;
      if (entry.refs === 0 && shared === entry) {
        entry.teardown();
        shared = null;
      }
    };
  }, [user?.id, queryClient]);
}

/**
 * One page-able inbox lens. Freshness comes from `useInboxRealtime` (mounted
 * once by the header), not from a channel per feed.
 */
export function useInboxFeed(filter: InboxFilter = 'all', options: { enabled?: boolean } = {}) {
  const { user } = useAuth();

  const feed = useInfiniteQuery({
    queryKey: feedKey(user?.id, filter),
    enabled: !!user && options.enabled !== false,
    initialPageParam: null as { ts: string; id: string } | null,
    queryFn: async ({ pageParam, signal }) => {
      if (filter === 'mail') return fetchMailboxFeed(user!.id, pageParam, signal);
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

  const unreadCount = useInboxUnreadCount();

  // Pins float to the top of the already-loaded feed (client-side pass so the
  // RPC's (ts,id) cursor pagination stays simple). A pinned chat older than the
  // loaded window is an accepted edge case.
  const flat = (feed.data?.pages.flat() ?? []) as InboxItem[];
  const items = flat.some((i) => i.is_pinned)
    ? [...flat].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
    : flat;

  return {
    items,
    unreadCount,
    loading: feed.isLoading,
    hasNextPage: feed.hasNextPage,
    fetchNextPage: feed.fetchNextPage,
    isFetchingNextPage: feed.isFetchingNextPage,
    error: feed.error,
    refetch: feed.refetch,
  };
}
