import { useState, useRef, useEffect } from 'react';
import type { SetURLSearchParams } from 'react-router';
import type { InboxFilter, InboxItem } from '@/hooks/useInboxFeed';
import { mailboxSelection } from '@/lib/mailboxSelection';

/** Routed conversations/mail follow the URL; only notification cards need local selection. */
export function useInboxSelection(
  filter: InboxFilter | undefined,
  items: InboxItem[],
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
) {
  const [notification, setNotification] = useState<InboxItem | null>(null);
  const conversationId = searchParams.get('conversation');
  const emailId = searchParams.get('email');
  const tripmailId = searchParams.get('tripmail');
  const mail = emailId ? mailboxSelection(emailId) : null;
  const selected = conversationId
    ? (items.find((item) => item.id === `conv_${conversationId}`) ?? null)
    : emailId
      ? mail
        ? (items.find((item) => item.id === mail.id) ?? mail)
        : null
      : tripmailId
        ? (items.find((item) => item.id === `tripmail_${tripmailId}`) ?? null)
        : notification;

  // A filter click clears the previous detail; the initial URL remains authoritative.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setNotification(null);
    if (
      searchParams.has('conversation') ||
      searchParams.has('email') ||
      searchParams.has('tripmail')
    ) {
      const next = new URLSearchParams(searchParams);
      next.delete('conversation');
      next.delete('email');
      next.delete('tripmail');
      setSearchParams(next, { replace: true });
    }
    // The effect responds only to the filter, not to ordinary detail navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleSelect = (item: InboxItem) => {
    setNotification(item.kind === 'notification' ? item : null);
    const next = new URLSearchParams(searchParams);
    next.delete('conversation');
    next.delete('email');
    next.delete('tripmail');
    if (item.kind === 'chat') next.set('conversation', item.id.replace('conv_', ''));
    else if (item.kind === 'mail') next.set('email', item.id.replace('mail_', ''));
    else if (item.kind === 'trip_email') next.set('tripmail', item.id.replace('tripmail_', ''));
    setSearchParams(next, { replace: true });
  };
  const handleBack = () => {
    setNotification(null);
    const next = new URLSearchParams(searchParams);
    next.delete('conversation');
    next.delete('email');
    next.delete('tripmail');
    setSearchParams(next, { replace: true });
  };
  return { selected, handleSelect, handleBack };
}
