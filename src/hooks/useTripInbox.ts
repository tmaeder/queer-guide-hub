/**
 * useTripInbox — per-trip email forwarding inbox (Phase 7 Layer C).
 *
 * Lazy: never creates a `trip_inboxes` row until `enable()` is called.
 * Returns the live address (or null), parsed inbox items, and mutations
 * to enable / revoke / regenerate / slot / dismiss / paste-confirm.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { qk } from '@/lib/queryKeys';

export interface TripInboxItem {
  id: string;
  trip_id: string;
  raw_subject: string | null;
  raw_from: string | null;
  parse_status: 'pending' | 'parsed' | 'failed' | 'slotted' | 'dismissed';
  parse_confidence: number | null;
  parsed_type: string | null;
  parsed_vendor: string | null;
  parsed_title: string | null;
  parsed_start_at: string | null;
  parsed_end_at: string | null;
  parsed_location: string | null;
  parsed_price: number | null;
  parsed_currency: string | null;
  parsed_confirmation: string | null;
  slotted_reservation_id: string | null;
  created_at: string;
}

const INBOX_DOMAIN = 'inbox.queer.guide';

export function useTripInbox(tripId: string | undefined) {
  const queryClient = useQueryClient();

  const inboxQuery = useQuery({
    queryKey: qk.trip.facet(tripId, 'inbox'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_inboxes')
        .select('id, short_id, revoked_at, created_at')
        .eq('trip_id', tripId!)
        .is('revoked_at', null)
        .eq('routing_status', 'ready')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tripId,
    staleTime: 60 * 1000,
  });

  const itemsQuery = useQuery({
    queryKey: qk.trip.facet(tripId, 'inbox-items'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_inbox_items')
        .select('*')
        .eq('trip_id', tripId!)
        .in('parse_status', ['parsed', 'failed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TripInboxItem[];
    },
    enabled: !!tripId,
    staleTime: 30 * 1000,
  });

  const invalidateInbox = () => {
    void queryClient.invalidateQueries({ queryKey: qk.trip.facet(tripId, 'inbox') });
  };
  const manageInbox = async (action: 'enable' | 'revoke' | 'regenerate') => {
    if (!tripId) throw new Error('no trip');
    const { data, error } = await supabase.functions.invoke('trip-inbox-manage', {
      body: { action, trip_id: tripId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const enable = useMutation({
    mutationFn: () => manageInbox('enable'),
    onSettled: invalidateInbox,
  });
  const revoke = useMutation({
    mutationFn: () => manageInbox('revoke'),
    onSettled: invalidateInbox,
  });
  const regenerateMutation = useMutation({
    mutationFn: () => manageInbox('regenerate'),
    onSettled: invalidateInbox,
  });
  const regenerate = useCallback(() => regenerateMutation.mutateAsync(), [regenerateMutation]);

  const slotItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.functions.invoke('trip-inbox-slot', {
        body: { item_id: itemId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.trip.facet(tripId, 'inbox-items') });
      void queryClient.invalidateQueries({ queryKey: qk.trip.facet(tripId, 'reservations') });
    },
  });

  const dismissItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('trip_inbox_items')
        .update({ parse_status: 'dismissed' })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.trip.facet(tripId, 'inbox-items') });
    },
  });

  const pasteConfirmation = useMutation({
    mutationFn: async (rawText: string) => {
      if (!tripId) throw new Error('no trip');
      const { data, error } = await supabase.functions.invoke('trip-inbox-slot', {
        body: { trip_id: tripId, raw_text: rawText },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.trip.facet(tripId, 'inbox-items') });
      void queryClient.invalidateQueries({ queryKey: qk.trip.facet(tripId, 'reservations') });
    },
  });

  const address = useMemo(() => {
    if (!inboxQuery.data?.short_id) return null;
    return `trip-${inboxQuery.data.short_id}@${INBOX_DOMAIN}`;
  }, [inboxQuery.data?.short_id]);

  return {
    address,
    inbox: inboxQuery.data ?? null,
    inboxLoading: inboxQuery.isLoading,
    items: itemsQuery.data ?? [],
    itemsLoading: itemsQuery.isLoading,
    enable,
    revoke,
    regenerate,
    slotItem,
    dismissItem,
    pasteConfirmation,
  };
}
