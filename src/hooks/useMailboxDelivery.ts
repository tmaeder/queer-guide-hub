import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { MailboxEmail } from '@/hooks/useMailbox';
import { isMailboxDeliveryPending, isMailboxDeliveryStatus } from '@/lib/mailboxDelivery';
import { qk } from '@/lib/queryKeys';

export async function fetchMailboxDelivery(emailId: string, ownerId: string, signal: AbortSignal) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || session.user.id !== ownerId) {
    throw new Error('Mailbox session changed');
  }
  signal.throwIfAborted();
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/send-mailbox-email?email_id=${encodeURIComponent(emailId)}`,
    {
      method: 'GET',
      signal,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      },
    },
  );
  if (!response.ok) throw new Error('Mailbox receipt unavailable');
  const result = await response.json();
  if (
    !result ||
    (result.delivery_status !== null && !isMailboxDeliveryStatus(result.delivery_status))
  ) {
    throw new Error('Invalid mailbox receipt');
  }
  return result.delivery_status as import('@/lib/mailboxDelivery').MailboxDeliveryStatus | null;
}

/** Read canonical proof only; refreshing can never submit or retry a message. */
export function useMailboxDelivery(email: MailboxEmail | null) {
  const { user } = useAuth();
  const client = useQueryClient();
  const ownerId = user?.id;
  const emailId = email?.id;
  const enabled =
    !!ownerId &&
    !!emailId &&
    email?.owner_id === ownerId &&
    email.direction === 'outbound' &&
    email.status !== 'draft';
  const query = useQuery({
    queryKey: qk.mailbox.delivery(ownerId, emailId),
    enabled,
    queryFn: ({ signal }) => fetchMailboxDelivery(emailId!, ownerId!, signal),
    retry: false,
    staleTime: 15_000,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (current) => (isMailboxDeliveryPending(current.state.data) ? 30_000 : false),
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = () => {
      if (active)
        void client.invalidateQueries({
          queryKey: qk.mailbox.delivery(ownerId, emailId),
          exact: true,
        });
    };
    const channel = supabase
      .channel(`mailbox-delivery:${ownerId}:${emailId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mailbox_emails', filter: `id=eq.${emailId}` },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [client, enabled, ownerId, emailId]);
  return { ...query, enabled };
}
