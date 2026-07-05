/**
 * useTripEmailThread — one forwarded-email thread (trip_inbox_items row +
 * its trip_inbox_messages chat log) surfaced in the unified inbox.
 *
 * send()    → trip-inbox-chat edge fn (LLM correction loop; may update fields)
 * confirm() → existing trip-inbox-slot edge fn (files the reservation)
 * dismiss() → parse_status='dismissed'
 * markRead()→ mark_trip_inbox_item_read RPC (viewers can't UPDATE items)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type { TripInboxItem } from '@/hooks/useTripInbox';

export interface TripEmailTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposed: Record<string, unknown> | null;
  created_at: string;
}

export interface ExtractedEntity {
  title?: string;
  name?: string;
  [key: string]: unknown;
}
export interface ExtractedEntities {
  events?: ExtractedEntity[];
  venues?: ExtractedEntity[];
}
export type TripEmailItem = TripInboxItem & {
  read_at: string | null;
  extracted_entities: ExtractedEntities | null;
};

const itemKey = (id: string) => ['trip-email-item', id] as const;
const turnsKey = (id: string) => ['trip-email-turns', id] as const;

export function useTripEmailThread(itemId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: itemKey(itemId) });
    void queryClient.invalidateQueries({ queryKey: turnsKey(itemId) });
    void queryClient.invalidateQueries({ queryKey: ['inbox-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-unread'] });
  };

  const itemQuery = useQuery({
    queryKey: itemKey(itemId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_inbox_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as TripEmailItem) ?? null;
    },
  });

  const turnsQuery = useQuery({
    queryKey: turnsKey(itemId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_inbox_messages' as never)
        .select('id, role, content, proposed, created_at')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TripEmailTurn[];
    },
  });

  const send = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke('trip-inbox-chat', {
        body: { item_id: itemId, message },
      });
      if (error) throw error;
      return data as { reply: string; fields?: Record<string, unknown>; item: TripInboxItem };
    },
    onSuccess: invalidate,
  });

  const stage = useMutation({
    mutationFn: async (entityIndexes?: number[]) => {
      const { data, error } = await supabase.functions.invoke('trip-inbox-chat', {
        body: { item_id: itemId, action: 'stage', entity_indexes: entityIndexes },
      });
      if (error) throw error;
      return data as { success: boolean; staged: number };
    },
    onSuccess: invalidate,
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('trip-inbox-slot', {
        body: { item_id: itemId },
      });
      if (error) throw error;
      return data as { success: boolean; reservation_id: string };
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['trip-inbox-items'] });
      void queryClient.invalidateQueries({ queryKey: ['trip-reservations'] });
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('trip_inbox_items')
        .update({ parse_status: 'dismissed' })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['trip-inbox-items'] });
    },
  });

  const markRead = useMutation({
    mutationFn: async () => {
      const { error } = await untypedRpc('mark_trip_inbox_item_read', { p_item: itemId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox-feed'] });
      void queryClient.invalidateQueries({ queryKey: ['inbox-unread'] });
    },
  });

  return {
    item: itemQuery.data ?? null,
    itemLoading: itemQuery.isLoading,
    turns: turnsQuery.data ?? [],
    turnsLoading: turnsQuery.isLoading,
    send,
    stage,
    confirm,
    dismiss,
    markRead,
  };
}
