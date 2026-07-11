import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MessagingInterface } from '@/components/messaging/MessagingInterface';
import { InboxFilterChips } from '@/components/messaging/InboxFilterChips';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import type { InboxFilter } from '@/hooks/useInboxFeed';

/**
 * Hub Messages module — the unified inbox (2026-07 declutter). One surface:
 * filter chips + the self-contained rail+detail MessagingInterface. The
 * former "People" sub-tab (friends / groups / dating address book) is gone —
 * people are single-homed at /people and /community/groups; legacy
 * ?tab=people deep links redirect there.
 */
export function MessagesModule() {
  const navigate = useLocalizedNavigate();
  // Deep-link support: /hub/messages?filter=matches opens pre-filtered to the
  // Matches lens. The ?conversation= param is read by MessagingInterface.
  const [searchParams] = useSearchParams();
  const initialFilter = useMemo<InboxFilter>(() => {
    const f = searchParams.get('filter');
    const valid: InboxFilter[] = ['all', 'chats', 'mail', 'alerts', 'trips', 'matches', 'groups'];
    return valid.includes(f as InboxFilter) ? (f as InboxFilter) : 'all';
  }, [searchParams]);
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);

  // Legacy ?tab=people deep links (pre-declutter) → the People page.
  const wantsPeople = searchParams.get('tab') === 'people';
  useEffect(() => {
    if (wantsPeople) navigate('/people', { replace: true });
  }, [wantsPeople, navigate]);

  return (
    <div className="flex h-full flex-col gap-4">
      <InboxFilterChips value={filter} onChange={setFilter} />
      <MessagingInterface
        filter={filter}
        className="h-[calc(100vh-320px)] md:h-[calc(100vh-280px)] md:max-h-[820px]"
      />
    </div>
  );
}
