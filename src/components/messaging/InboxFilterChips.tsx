import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useInboxUnreadCounts, type InboxFilter } from '@/hooks/useInboxFeed';
import { useUpcomingTrips } from '@/hooks/useUpcomingTrips';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useGroups } from '@/hooks/useGroups';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function InboxFilterChips({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (filter: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  const counts = useInboxUnreadCounts();
  const badge = (key: InboxFilter) =>
    counts[key] > 0 ? (
      <span
        className="ml-2 text-2xs tabular-nums"
        aria-label={t('inbox.unreadCount', {
          defaultValue: '{{count}} unread',
          count: counts[key],
        })}
      >
        {counts[key] > 99 ? '99+' : counts[key]}
      </span>
    ) : null;
  const { data: profile } = useMyIntimateProfile();
  const { userGroups } = useGroups();
  const { data: trips } = useUpcomingTrips();
  const conversations = ['chats', 'matches', 'groups'].includes(value);
  const primary = conversations ? 'chats' : value === 'trips' ? 'all' : value;
  const filters = [
    { key: 'all', label: t('inbox.filter.all', { defaultValue: 'All' }) },
    { key: 'chats', label: t('inbox.filter.conversations', { defaultValue: 'Conversations' }) },
    { key: 'mail', label: t('inbox.filter.mail', { defaultValue: 'Mail' }) },
    { key: 'alerts', label: t('inbox.filter.updates', { defaultValue: 'Updates' }) },
  ] as const;
  const lenses = conversations
    ? [
        {
          key: 'chats',
          label: t('inbox.filter.allConversations', { defaultValue: 'All conversations' }),
        },
        ...(profile
          ? [{ key: 'matches', label: t('inbox.filter.matches', { defaultValue: 'Matches' }) }]
          : []),
        ...(userGroups?.length
          ? [{ key: 'groups', label: t('inbox.filter.groups', { defaultValue: 'Groups' }) }]
          : []),
      ]
    : primary === 'all' && (trips?.length || value === 'trips')
      ? [
          { key: 'all', label: t('inbox.filter.everything', { defaultValue: 'Everything' }) },
          { key: 'trips', label: t('inbox.filter.trips', { defaultValue: 'Trips' }) },
        ]
      : [];

  return (
    <div className="min-w-0 space-y-2">
      <Tabs value={primary} onValueChange={(next) => onChange(next as InboxFilter)}>
        <div className="overflow-x-auto">
          <TabsList
            aria-label={t('inbox.filter.categories', { defaultValue: 'Inbox categories' })}
            className="h-auto min-w-max"
          >
            {filters.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="min-h-11">
                {label}
                {badge(key)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {lenses.length > 1 && (
        <div
          role="group"
          aria-label={t('inbox.filter.context', { defaultValue: 'Filter this category' })}
          className="flex gap-1 overflow-x-auto"
        >
          {lenses.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={value === key}
              onClick={() => onChange(key as InboxFilter)}
              className={cn(
                'min-h-11 shrink-0 rounded-element px-4 text-13 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                value === key
                  ? 'bg-muted font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {label}
              {badge(key as InboxFilter)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
