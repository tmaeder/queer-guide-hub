import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessagingInterface } from '@/components/messaging/MessagingInterface';
import { InboxFilterChips } from '@/components/messaging/InboxFilterChips';
import { FriendsPanel } from '@/components/community/FriendsPanel';
import { GroupsTab } from '@/components/profile/tabs/GroupsTab';
import { DatingSection } from '@/components/hub/contacts/DatingSection';
import { useAuth } from '@/hooks/useAuth';
import type { InboxFilter } from '@/hooks/useInboxFeed';

/**
 * Hub Messages module — the merged Inbox + Contacts surface (2026-07). Two
 * sub-views: "Chats" (the former Inbox: filter chips + the self-contained
 * rail+detail MessagingInterface) and "People" (the former Contacts address
 * book: friends, group memberships and the self-gated dating link).
 *
 * The old Contacts "Recent chats" shortcut is gone — it duplicated the inbox
 * it linked into. Recent conversations now live only here, in Chats.
 */
export function MessagesModule() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Deep-link support: /hub/messages?filter=matches (from DatingSection /
  // Overview) opens the Chats sub-view pre-filtered to the Matches lens. The
  // ?conversation= param is read by MessagingInterface itself.
  const [searchParams] = useSearchParams();
  const initialFilter = useMemo<InboxFilter>(() => {
    const f = searchParams.get('filter');
    const valid: InboxFilter[] = ['all', 'chats', 'mail', 'alerts', 'trips', 'matches'];
    return valid.includes(f as InboxFilter) ? (f as InboxFilter) : 'all';
  }, [searchParams]);
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  // ?tab=people (from Overview's "All people" link) opens the People sub-view.
  const [tab, setTab] = useState(searchParams.get('tab') === 'people' ? 'people' : 'chats');

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-4">
      <TabsList className="self-start">
        <TabsTrigger value="chats">
          {t('hub.messages.chats', { defaultValue: 'Chats' })}
        </TabsTrigger>
        <TabsTrigger value="people">
          {t('hub.messages.people', { defaultValue: 'People' })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="chats" className="flex flex-1 flex-col">
        <InboxFilterChips value={filter} onChange={setFilter} />
        <MessagingInterface
          filter={filter}
          className="h-[calc(100vh-320px)] md:h-[calc(100vh-280px)] md:max-h-[820px]"
        />
      </TabsContent>

      <TabsContent value="people" className="flex flex-col gap-8">
        <section className="flex flex-col gap-2">
          <h2 className="text-title font-display">
            {t('hub.contacts.friends', { defaultValue: 'Friends' })}
          </h2>
          <FriendsPanel />
        </section>

        {user && (
          <section className="flex flex-col gap-2">
            <h2 className="text-title font-display">
              {t('hub.contacts.groups', { defaultValue: 'Groups' })}
            </h2>
            <GroupsTab userId={user.id} isOwnProfile lens="you" />
          </section>
        )}

        <DatingSection />
      </TabsContent>
    </Tabs>
  );
}
