import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FriendsPanel } from '@/components/community/FriendsPanel';
import { GroupsTab } from '@/components/profile/tabs/GroupsTab';
import { DatingSection } from '@/components/hub/contacts/DatingSection';
import { useAuth } from '@/hooks/useAuth';
import { useInboxFeed } from '@/hooks/useInboxFeed';

/**
 * Hub Contacts module — the address book: friends + pending requests (shared
 * FriendsPanel), group memberships (GroupsTab), a shortcut to recent
 * conversations, and a self-gated dating link. One search box filters the
 * recent-chats shortcut list.
 */
export function ContactsModule() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { items } = useInboxFeed('chats');
  const [search, setSearch] = useState('');

  const recentChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const chats = items.filter((i) => i.kind === 'chat');
    return (q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats).slice(0, 6);
  }, [items, search]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-headline font-display">
          {t('hub.contacts.title', { defaultValue: 'Contacts' })}
        </h1>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('hub.contacts.search', { defaultValue: 'Search contacts…' })}
          className="h-9 max-w-56 rounded-element"
        />
      </div>

      {recentChats.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-title font-display">
            {t('hub.contacts.recent', { defaultValue: 'Recent chats' })}
          </h2>
          <div className="flex flex-col gap-2">
            {recentChats.map((chat) => (
              <LocalizedLink
                key={chat.id}
                to={`/hub?conversation=${chat.id.replace('conv_', '')}`}
                className="flex items-center gap-2 rounded-element border border-border px-4 py-2 no-underline transition-colors hover:bg-muted"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={chat.avatar_url ?? undefined} alt="" />
                  <AvatarFallback>
                    <MessageCircle className="h-4 w-4" aria-hidden />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium">{chat.title}</span>
              </LocalizedLink>
            ))}
          </div>
        </section>
      )}

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
    </div>
  );
}
