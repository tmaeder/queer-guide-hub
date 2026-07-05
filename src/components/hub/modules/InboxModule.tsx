import { useState } from 'react';
import { MessagingInterface } from '@/components/messaging/MessagingInterface';
import { InboxFilterChips } from '@/components/messaging/InboxFilterChips';
import type { InboxFilter } from '@/hooks/useInboxFeed';

/**
 * Hub inbox module — the former /messages page body: filter chips + the
 * self-contained rail+detail MessagingInterface, given the full workspace
 * height.
 */
export function InboxModule() {
  const [filter, setFilter] = useState<InboxFilter>('all');

  return (
    <div className="flex h-full flex-col">
      <InboxFilterChips value={filter} onChange={setFilter} />
      <MessagingInterface
        filter={filter}
        className="h-[calc(100vh-260px)] md:h-[calc(100vh-220px)] md:max-h-[820px]"
      />
    </div>
  );
}
