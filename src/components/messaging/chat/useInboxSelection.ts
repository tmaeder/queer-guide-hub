import { useEffect, useRef, useState } from 'react';
import { mailboxSelection } from '@/lib/mailboxSelection';
import type { SetURLSearchParams } from 'react-router';
import type { InboxFilter, InboxItem } from '@/hooks/useInboxFeed';

/** URL is authoritative, including browser back/forward and recipient-picker changes.
 * Retain the opened item while read-state updates remove it from a filtered feed. */
export function useInboxSelection(
  filter: InboxFilter | undefined,
  items: InboxItem[],
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
) {
  const [snapshot, setSnapshot] = useState<InboxItem | null>(null);
  const keys = {
    chat: 'conversation',
    mail: 'email',
    trip_email: 'tripmail',
    notification: 'notification',
  } as const;
  const prefixes = {
    conversation: 'conv_',
    email: 'mail_',
    tripmail: 'tripmail_',
    notification: '',
  };
  const entry = Object.entries(prefixes).find(([key]) => searchParams.has(key));
  const id = entry ? `${entry[1]}${searchParams.get(entry[0])}` : null;
  const mail = entry?.[0] === 'email' ? mailboxSelection(searchParams.get('email')!) : null;
  const selected = items.find((item) => item.id === id) ?? (snapshot?.id === id ? snapshot : mail);
  const clearSelection = () => {
    const next = new URLSearchParams(searchParams);
    Object.values(keys).forEach((key) => next.delete(key));
    return next;
  };
  const previousFilter = useRef(filter);
  const previousSelection = useRef(id);
  useEffect(() => {
    const selectionChanged = previousSelection.current !== id;
    previousSelection.current = id;
    if (previousFilter.current === filter) return;
    previousFilter.current = filter;
    // Picking a recipient can intentionally change category and thread together.
    if (selectionChanged) return;
    setSnapshot(null);
    const next = new URLSearchParams(searchParams);
    const keys = ['conversation', 'email', 'tripmail', 'notification'];
    if (!keys.some((key) => next.has(key))) return;
    keys.forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  }, [filter, id, searchParams, setSearchParams]);
  const handleSelect = (item: InboxItem) => {
    setSnapshot(item);
    const next = clearSelection();
    const key = keys[item.kind];
    next.set(key, key === 'notification' ? item.id : item.id.replace(prefixes[key], ''));
    setSearchParams(next);
  };
  const handleBack = () => {
    setSnapshot(null);
    setSearchParams(clearSelection(), { replace: true });
  };
  return { selected, handleSelect, handleBack };
}
