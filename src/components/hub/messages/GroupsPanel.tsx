import { useTranslation } from 'react-i18next';
import { Users, MessageCircle, ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useGroups } from '@/hooks/useGroups';

/**
 * Hub Messages → People → Groups: "your groups, jump to chat" — replaces the
 * former bare GroupsTab join/leave grid (still used, unmodified, on the
 * public profile page). Each row deep-links straight into the group's thread
 * in the unified inbox (mirrors DatingSection's "Your matches" deep-link);
 * discovery of new groups stays at /community/groups rather than duplicating
 * a browsable grid here.
 */
export function GroupsPanel() {
  const { t } = useTranslation();
  const { userGroups, isLoading } = useGroups();

  if (isLoading) return null;

  if (userGroups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('hub.contacts.groupsEmptyTitle', { defaultValue: 'No groups yet.' })}
        description={t('hub.contacts.groupsEmptyBody', {
          defaultValue: 'Join a group to find people and events near you.',
        })}
        mood="encouraging"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {userGroups.map((group) => (
          <LocalizedLink
            key={group.id}
            to={
              group.chat_conversation_id
                ? `/hub/messages?filter=groups&conversation=${group.chat_conversation_id}`
                : `/groups/${group.id}`
            }
            className="flex items-center gap-4 rounded-element border border-border px-4 py-2 no-underline transition-colors hover:bg-muted"
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={group.image_url || undefined} alt={group.name} />
              <AvatarFallback>
                <Users className="h-4 w-4" aria-hidden />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{group.name}</p>
              <p className="truncate text-13 text-muted-foreground">
                {t('hub.contacts.groupMembers', {
                  defaultValue: '{{count}} members',
                  count: group.member_count,
                })}
              </p>
            </div>
            <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </LocalizedLink>
        ))}
      </div>

      <LocalizedLink
        to="/community/groups"
        className="flex items-center gap-1 self-start text-13 text-muted-foreground no-underline hover:text-foreground"
      >
        {t('hub.contacts.browseMoreGroups', { defaultValue: 'Browse more groups' })}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </LocalizedLink>
    </div>
  );
}
