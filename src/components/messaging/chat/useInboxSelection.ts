import { useState, useRef, useEffect } from 'react';
import type { SetURLSearchParams } from 'react-router';
import type { InboxFilter, InboxItem } from '@/hooks/useInboxFeed';

/**
 * Inbox selection + deep-linking: preselect from ?conversation=/?email=, reset
 * selection on filter change, and keep the URL params in sync on select/back.
 * Extracted verbatim from MessagingInterface — behavior-preserving. Shares the
 * caller's useSearchParams tuple so the RecipientPicker path stays consistent.
 */
export function useInboxSelection(
  filter: InboxFilter | undefined,
  items: InboxItem[],
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
) {
  const [selected, setSelected] = useState<InboxItem | null>(null);

  // Deep-link: preselect a chat when ?conversation=<id> is present, or a mail
  // item when ?email=<id> is present, once the matching item has loaded into
  // the feed.
  useEffect(() => {
    if (selected) return;
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      const match = items.find((i) => i.id === `conv_${conversationId}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link preselect once the matching item loads into the feed; documented exemption from the eslint.config.js staged-ratchet plan.
      if (match) setSelected(match);
      return;
    }
    const emailId = searchParams.get('email');
    if (emailId) {
      const match = items.find((i) => i.id === `mail_${emailId}`);
      if (match) setSelected(match);
      return;
    }
    const tripmailId = searchParams.get('tripmail');
    if (tripmailId) {
      const match = items.find((i) => i.id === `tripmail_${tripmailId}`);
      if (match) setSelected(match);
    }
  }, [searchParams, items, selected]);

  // Reset selection when the filter chip changes. Skip the very first render so
  // the deep-link effect above can still establish its initial selection before
  // we'd accidentally null it out (both effects fire on mount; the hasMounted
  // guard ensures we only reset on *subsequent* filter changes driven by user
  // interaction).
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setSelected(null);
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
    // searchParams intentionally omitted — we only want to react to filter changes,
    // not re-run every time the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleSelect = (item: InboxItem) => {
    setSelected(item);
    const next = new URLSearchParams(searchParams);
    next.delete('conversation');
    next.delete('email');
    next.delete('tripmail');
    if (item.kind === 'chat') {
      next.set('conversation', item.id.replace('conv_', ''));
    } else if (item.kind === 'mail') {
      next.set('email', item.id.replace('mail_', ''));
    } else if (item.kind === 'trip_email') {
      next.set('tripmail', item.id.replace('tripmail_', ''));
    }
    // notifications carry no deep-link param
    setSearchParams(next, { replace: true });
  };

  const handleBack = () => {
    setSelected(null);
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
  };

  return { selected, setSelected, handleSelect, handleBack };
}
