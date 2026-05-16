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
import { useAuth } from '@/hooks/useAuth';

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

function randomShortId(): string {
  // 12 chars, lowercase base32-ish — avoids look-alike chars (0/o, 1/l).
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function useTripInbox(tripId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const inboxQuery = useQuery({
    queryKey: ['trip-inbox', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_inboxes')
        .select('id, short_id, revoked_at, created_at')
        .eq('trip_id', tripId!)
        .is('revoked_at', null)
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
    queryKey: ['trip-inbox-items', tripId],
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

  const enable = useMutation({
    mutationFn: async () => {
      if (!tripId) throw new Error('no trip');
      if (!user) throw new Error('not authenticated');
      const shortId = randomShortId();
      const { data, error } = await supabase
        .from('trip_inboxes')
        .insert({ trip_id: tripId, short_id: shortId, created_by: user.id })
        .select('id, short_id, revoked_at, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip-inbox', tripId] });
    },
  });

  const revoke = useMutation({
    mutationFn: async () => {
      if (!inboxQuery.data) return;
      const { error } = await supabase
        .from('trip_inboxes')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inboxQuery.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip-inbox', tripId] });
    },
  });

  const regenerate = useCallback(async () => {
    await revoke.mutateAsync();
    await enable.mutateAsync();
  }, [revoke, enable]);

  const slotItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.functions.invoke('trip-inbox-slot', {
        body: { item_id: itemId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip-inbox-items', tripId] });
      void queryClient.invalidateQueries({ queryKey: ['trip-reservations', tripId] });
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
      void queryClient.invalidateQueries({ queryKey: ['trip-inbox-items', tripId] });
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
      void queryClient.invalidateQueries({ queryKey: ['trip-inbox-items', tripId] });
      void queryClient.invalidateQueries({ queryKey: ['trip-reservations', tripId] });
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
