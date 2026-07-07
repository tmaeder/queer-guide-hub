import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useInboxFeed, type InboxFilter } from '@/hooks/useInboxFeed';
import { useUpcomingTrips } from '@/hooks/useUpcomingTrips';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { useGroups } from '@/hooks/useGroups';

const BASE_FILTERS: { key: InboxFilter; labelKey: string; defaultLabel: string }[] = [
  { key: 'all', labelKey: 'inbox.filter.all', defaultLabel: 'All' },
  { key: 'chats', labelKey: 'inbox.filter.chats', defaultLabel: 'Chats' },
  { key: 'mail', labelKey: 'inbox.filter.mail', defaultLabel: 'Mail' },
  { key: 'alerts', labelKey: 'inbox.filter.alerts', defaultLabel: 'Alerts' },
];

const chipClass = (active: boolean) =>
  cn(
    'flex min-h-0 items-center whitespace-nowrap rounded-badge border px-4 py-2 text-13',
    active ? 'bg-foreground text-background' : 'bg-background text-foreground',
  );

/**
 * Matches lens chip with a new-match signal: an unread badge counting match
 * conversations you haven't opened yet. Isolated into its own component so the
 * extra matches-feed query only runs for opted-in users (the chip is only
 * rendered when useMyIntimateProfile resolves).
 */
function MatchesFilterChip({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  const { items } = useInboxFeed('matches');
  const unread = items.filter((i) => i.unread).length;
  const active = value === 'matches';

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onChange('matches')}
      className={chipClass(active)}
    >
      {t('inbox.filter.matches', { defaultValue: 'Matches' })}
      {unread > 0 && (
        <span
          className={cn(
            'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold',
            active ? 'bg-background text-foreground' : 'bg-foreground text-background',
          )}
          aria-label={t('inbox.filter.matchesUnread', {
            defaultValue: '{{count}} new matches',
            count: unread,
          })}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

/**
 * Groups lens chip, mirroring MatchesFilterChip: an unread badge counting
 * group threads you haven't opened yet. Only rendered once the viewer
 * belongs to at least one group (empty-affordance discipline matches Matches
 * and Trips below).
 */
function GroupsFilterChip({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  const { items } = useInboxFeed('groups');
  const unread = items.filter((i) => i.unread).length;
  const active = value === 'groups';

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onChange('groups')}
      className={chipClass(active)}
    >
      {t('inbox.filter.groups', { defaultValue: 'Groups' })}
      {unread > 0 && (
        <span
          className={cn(
            'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold',
            active ? 'bg-background text-foreground' : 'bg-foreground text-background',
          )}
          aria-label={t('inbox.filter.groupsUnread', {
            defaultValue: '{{count}} unread group messages',
            count: unread,
          })}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

export function InboxFilterChips({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  const { data: upcomingTrips } = useUpcomingTrips();
  const hasUpcomingTrips = (upcomingTrips?.length ?? 0) > 0;
  // Dating matches are a self-gated lens — only surface the chip once the
  // viewer has opted into the intimate profile (mirrors DatingSection's gate).
  const { data: intimateProfile } = useMyIntimateProfile();
  const { userGroups } = useGroups();
  const hasGroups = (userGroups?.length ?? 0) > 0;

  return (
    <div className="flex gap-2 overflow-x-auto p-2" role="tablist">
      {BASE_FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={value === f.key}
          onClick={() => onChange(f.key)}
          className={chipClass(value === f.key)}
        >
          {t(f.labelKey, { defaultValue: f.defaultLabel })}
        </button>
      ))}
      {intimateProfile && <MatchesFilterChip value={value} onChange={onChange} />}
      {hasGroups && <GroupsFilterChip value={value} onChange={onChange} />}
      {hasUpcomingTrips && (
        <button
          role="tab"
          aria-selected={value === 'trips'}
          onClick={() => onChange('trips')}
          className={chipClass(value === 'trips')}
        >
          {t('inbox.filter.trips', { defaultValue: 'Trips' })}
        </button>
      )}
    </div>
  );
}
